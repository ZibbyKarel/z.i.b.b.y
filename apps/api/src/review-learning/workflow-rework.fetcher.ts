import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type Approval, WorkflowRunSchema } from "@zibby/contracts";
import { ApprovalsService } from "../approvals/approvals.service";
import { safeJson } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { WORKFLOW_RUNS_DIR } from "../workflows/workflow-runner.service";
import type { FetchedComment } from "./review-comment.fetcher";

export interface FetchReworkInput {
  projectId: string;
  projectPath: string;
  cursor?: string;
}

/** A line shorter than this is noise ("ok", "-"), not a note. */
const MIN_LINE_CHARS = 4;

/** `book/rejections.md` lines that restate the operator's own gate-revise note (counted via the approval). */
const OPERATOR_RESTATEMENT = /^-?\s*pages?\b[^:]*:\s*operator review:/i;

function normalise(line: string): string {
  return line.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Content-hash id: the same line in the same run maps to the same id from any source. */
export function reworkCommentId(workflowRunId: string, line: string): string {
  const hash = createHash("sha1")
    .update(`${workflowRunId}\n${normalise(line)}`)
    .digest("hex");
  return `wf-${hash.slice(0, 16)}`;
}

/** One note per non-empty line: trimmed, leading `- ` stripped, short lines dropped. */
export function reworkLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^-\s+/, ""))
    .filter((l) => l.length >= MIN_LINE_CHARS);
}

interface Source {
  at: string;
  author: string;
  commentUrl: string;
  text: string;
  skip?: (line: string) => boolean;
}

/**
 * Second review-learning source (next to `ReviewCommentFetcher`): the operator's
 * rework notes on a project's workflow runs, mapped onto `FetchedComment` so the
 * distiller, store and approval flow run unchanged. Every line is untrusted data
 * (Law 4) and only ever reaches a prompt through the distiller's envelope.
 * Fail-soft: never throws.
 */
@Injectable()
export class WorkflowReworkFetcher {
  private readonly log: ScopedLogger;

  constructor(
    @Inject(WORKFLOW_RUNS_DIR) private readonly runsDir: string,
    private readonly approvals: ApprovalsService,
    logger: LoggerService,
  ) {
    this.log = logger.child(WorkflowReworkFetcher.name);
  }

  async fetchNew(input: FetchReworkInput): Promise<{ comments: FetchedComment[] }> {
    const byId = new Map<string, FetchedComment>();
    const revised = await this.approvals.list("revised").catch((err: unknown) => {
      this.log.warn("could not list revised approvals", { error: String(err) });
      return [] as Approval[];
    });
    const entries = await fs
      .readdir(this.runsDir, { withFileTypes: true })
      .catch(() => [] as import("node:fs").Dirent[]);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const runDir = path.join(this.runsDir, entry.name);
        const raw = await fs.readFile(path.join(runDir, "run.json"), "utf8");
        const run = WorkflowRunSchema.safeParse(safeJson(raw));
        if (!run.success || !run.data.projectPath) continue;
        if (path.resolve(run.data.projectPath) !== path.resolve(input.projectPath)) continue;
        const runId = run.data.workflowRunId;

        const sources: Source[] = [];
        for (const a of revised) {
          if (a.kind === "workflow-gate" && a.runId === runId && a.reason && a.decidedAt) {
            sources.push({
              at: a.decidedAt,
              author: "operator",
              commentUrl: `approval:${a.id}`,
              text: a.reason,
            });
          }
        }
        for (const file of (await fs.readdir(runDir))
          .filter((f) => f.endsWith(".note.md"))
          .sort()) {
          sources.push(await this.fileSource(runDir, file, `${runId}/${file}`, "operator"));
        }
        const rejections = path.join("book", "rejections.md");
        if (await fs.stat(path.join(runDir, rejections)).catch(() => null)) {
          sources.push({
            ...(await this.fileSource(
              runDir,
              rejections,
              `${runId}/book/rejections.md`,
              "visual-audit",
            )),
            skip: (l) => OPERATOR_RESTATEMENT.test(l),
          });
        }

        for (const s of sources) {
          if (input.cursor && s.at <= input.cursor) continue;
          for (const line of reworkLines(s.text)) {
            if (s.skip?.(line)) continue;
            const commentId = reworkCommentId(runId, line);
            if (byId.has(commentId)) continue;
            byId.set(commentId, {
              commentId,
              prUrl: `workflow-run:${runId}`,
              commentUrl: s.commentUrl,
              author: s.author,
              at: s.at,
              body: line,
            });
          }
        }
      } catch (err) {
        this.log.warn("workflow rework scan failed for run — skipping", {
          run: entry.name,
          error: String(err),
        });
      }
    }

    const comments = [...byId.values()].sort(
      (a, b) => a.at.localeCompare(b.at) || a.commentId.localeCompare(b.commentId),
    );
    return { comments };
  }

  private async fileSource(
    runDir: string,
    rel: string,
    commentUrl: string,
    author: string,
  ): Promise<Source> {
    const file = path.join(runDir, rel);
    const [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
    return { at: stat.mtime.toISOString(), author, commentUrl, text };
  }
}
