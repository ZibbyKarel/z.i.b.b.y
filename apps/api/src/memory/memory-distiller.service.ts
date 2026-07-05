import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { AgentRun, GoalRun, NoteType, PipelineRun, Project } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ChatTranscriptStore } from "../chat/chat-transcript.store";
import { fileExists, writeFileAtomic } from "../shared/file-storage/file-utils";
import { ClaudeCliDistiller, type Learning, type RunDigest } from "./claude-cli-distiller";
import { DuplicateNoteError, SimilarNoteError, VaultService } from "./vault.service";

/**
 * Union of unique tags across a batch of learnings (Fáze 3), sorted for a stable
 * digest note. Exported for unit testing.
 */
export function mergeLearningTags(learnings: Learning[]): string[] {
  return [...new Set(learnings.flatMap((l) => l.tags))].sort();
}

/**
 * The batch's shared `type`, or `undefined` when the learnings span more than one
 * kind — a digest note covering several categories isn't honestly any single one.
 * Exported for unit testing.
 */
export function mergeLearningType(learnings: Learning[]): NoteType | undefined {
  const types = new Set(learnings.map((l) => l.type));
  return types.size === 1 ? [...types][0] : undefined;
}

/** Marker written into a run's cwd once it has been distilled (at-most-once intake). */
const MARKER = "memory-distilled.json";
/** Cap on the excerpt fed per run — keeps the batch prompt bounded. */
const EXCERPT_LIMIT = 1200;
/**
 * Never feed more than this many runs to one nightly pass. The rest stay UNMARKED
 * and carry to the next pass — nothing is dropped, only deferred (logged, not silent).
 */
const MAX_RUNS_PER_PASS = 30;

const TERMINAL_AGENT = new Set<AgentRun["status"]>(["done", "error", "interrupted"]);
const TERMINAL_PIPELINE = new Set<PipelineRun["status"]>(["done", "failed"]);
const TERMINAL_GOAL = new Set<GoalRun["status"]>(["done", "failed"]);

interface Candidate {
  cwd: string;
  projectId: string | null;
  summary: RunDigest;
  /** Set for chat conversations (no run `cwd`); drives the incremental marker. */
  chatId?: string;
  /** Message count distilled through, persisted on the chat marker after filing. */
  chatCount?: number;
}

/**
 * Nightly memory distillation (the system-owned "learn from every run"). Agents
 * stay memory-blind: this sweeps the terminal pipeline/agent/goal runs that haven't
 * been distilled yet, has a cheap model extract DURABLE learnings, and files them as
 * one digest knowledge note linked from each contributing project MOC. It is the
 * output-side mirror of grounding — the system reads learnings OUT just as grounding
 * writes context IN, without any agent knowing a vault exists.
 *
 * Lives ABOVE the runners + the vault (consumes both), like {@link RunRecorderService}
 * and the briefer — so it can never close a Nest DI cycle through MemoryModule.
 * Dispatched by the scheduler's `memory-distill` target (a system automation).
 */
@Injectable()
export class MemoryDistillerService {
  private readonly logger = new Logger(MemoryDistillerService.name);

  constructor(
    private readonly vault: VaultService,
    private readonly distiller: ClaudeCliDistiller,
    private readonly agents: AgentRunnerService,
    private readonly pipelines: PipelineRunnerService,
    private readonly goals: GoalRunnerService,
    private readonly projects: ProjectsStorageService,
    private readonly chat: ChatTranscriptStore,
  ) {}

  /**
   * Run one distillation pass; returns a `memory-distill:<count>` ref. NEVER throws —
   * the scheduler tick must survive a bad model call or a missing artifact, so every
   * failure is swallowed (fail-open, like the briefer).
   */
  async distill(now: Date = new Date()): Promise<string> {
    try {
      const candidates = await this.gather();
      if (candidates.length === 0) return "memory-distill:0";

      const learnings = await this.distiller.distill(candidates.map((c) => c.summary));
      if (learnings.length > 0) await this.fileDigest(now, learnings, candidates);

      // Mark only AFTER the digest is filed: a crash before this re-considers the
      // batch next pass (at-least-once — a duplicated digest line is harmless, a
      // silently dropped learning is not).
      await Promise.all(
        candidates.map((c) =>
          c.chatId !== undefined
            ? this.chat.markDistilled(c.chatId, c.chatCount ?? 0, now)
            : this.markDistilled(c.cwd),
        ),
      );
      this.logger.log(`distilled ${candidates.length} run(s) → ${learnings.length} learning(s)`);
      return `memory-distill:${candidates.length}`;
    } catch (error) {
      this.logger.warn(`memory distillation failed: ${String(error)}`);
      return "memory-distill:error";
    }
  }

  /** Terminal, not-yet-distilled runs across all three runners (capped per pass). */
  private async gather(): Promise<Candidate[]> {
    const out: Candidate[] = [];
    let deferred = 0;

    const consider = async (
      cwd: string,
      projectId: string | null,
      build: () => Promise<RunDigest>,
    ): Promise<void> => {
      if (await this.isDistilled(cwd)) return;
      if (out.length >= MAX_RUNS_PER_PASS) {
        deferred++;
        return;
      }
      out.push({ cwd, projectId, summary: await build() });
    };

    for (const run of await this.pipelines.listAll().catch((): PipelineRun[] => [])) {
      if (!TERMINAL_PIPELINE.has(run.status)) continue;
      const projectId = await this.byPath(run.projectPath);
      await consider(run.cwd, projectId, () => this.summarizePipeline(run, projectId));
    }
    for (const run of await this.agents.listAll().catch((): AgentRun[] => [])) {
      if (!TERMINAL_AGENT.has(run.status)) continue;
      const projectId = await this.byRef(run.project);
      await consider(run.cwd, projectId, () => this.summarizeAgent(run, projectId));
    }
    for (const run of await this.goals.listAll().catch((): GoalRun[] => [])) {
      if (!TERMINAL_GOAL.has(run.status)) continue;
      const projectId = await this.byPath(run.projectPath);
      await consider(run.cwd, projectId, async () => this.summarizeGoal(run, projectId));
    }
    // Chat conversations distill INCREMENTALLY (a thread is long-lived): only messages
    // past the marker's count are fed, and the count is advanced after filing.
    for (const id of await this.chat.listConversationIds().catch((): string[] => [])) {
      const distilled = await this.chat.distilledCount(id);
      const summary = await this.summarizeChat(id, distilled);
      if (!summary) continue;
      if (out.length >= MAX_RUNS_PER_PASS) {
        deferred++;
        continue;
      }
      out.push({ cwd: "", projectId: null, chatId: id, chatCount: summary.count, summary: summary.digest });
    }

    if (deferred > 0) {
      this.logger.log(`distill cap reached — deferring ${deferred} run(s) to the next pass`);
    }
    return out;
  }

  private async summarizePipeline(run: PipelineRun, projectId: string | null): Promise<RunDigest> {
    let excerpt = "";
    for (const name of ["docs.md", "review.md", "implementation.md"] as const) {
      const artifact = await this.pipelines.readArtifact(run.pipelineRunId, name).catch(() => null);
      if (artifact?.content.trim()) {
        excerpt = artifact.content.slice(0, EXCERPT_LIMIT);
        break;
      }
    }
    return {
      kind: "pipeline",
      id: run.pipelineRunId,
      name: run.pipelineId,
      status: run.status,
      ...(projectId ? { project: projectId } : {}),
      excerpt,
    };
  }

  private async summarizeAgent(run: AgentRun, projectId: string | null): Promise<RunDigest> {
    const log = await this.agents
      .readLog(run.runId, 0)
      .then((chunk) => chunk.content)
      .catch(() => "");
    return {
      kind: "agent",
      id: run.runId,
      name: run.agentId,
      status: run.status,
      ...(projectId ? { project: projectId } : {}),
      // The tail carries the run's outcome; the head is boilerplate startup.
      excerpt: log.slice(-EXCERPT_LIMIT),
    };
  }

  private summarizeGoal(run: GoalRun, projectId: string | null): RunDigest {
    const last = run.iterations.at(-1);
    const verdict = last
      ? `verifier(${last.verifier.kind}) satisfied=${last.verifier.satisfied}: ${last.verifier.output}`
      : "";
    return {
      kind: "goal",
      id: run.goalRunId,
      name: run.goalId,
      status: run.status,
      ...(projectId ? { project: projectId } : {}),
      excerpt: verdict.slice(0, EXCERPT_LIMIT),
    };
  }

  /**
   * Reduce the not-yet-distilled tail of a conversation to a digest. Returns null when
   * there are no new messages (nothing to distill) so the pass skips it cheaply.
   */
  private async summarizeChat(
    id: string,
    distilledCount: number,
  ): Promise<{ digest: RunDigest; count: number } | null> {
    const transcript = await this.chat.readTranscript(id).catch(() => null);
    if (!transcript || transcript.messages.length <= distilledCount) return null;
    const fresh = transcript.messages.slice(distilledCount);
    const excerpt = fresh
      .map((m) => `${m.role === "user" ? "Operátor" : "ZIBBY"}: ${m.text}`)
      .join("\n")
      .slice(-EXCERPT_LIMIT);
    return {
      digest: { kind: "chat", id, name: "konverzace", status: "done", excerpt },
      count: transcript.messages.length,
    };
  }

  /**
   * File the batch as one digest knowledge note + link it from each project MOC.
   * `createNote` runs with `dedupe: true` (Fáze 3): if today's fresh id collides
   * with a note written by an earlier pass THE SAME DAY, that's an exact-id
   * `DuplicateNoteError` — append as before. If instead it scores as a near-
   * duplicate of a PAST day's digest (`SimilarNoteError`), merge into that
   * existing note rather than filing a fresh one, and link/append point at it.
   */
  private async fileDigest(
    now: Date,
    learnings: Learning[],
    candidates: Candidate[],
  ): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    const noteId = `distilled-${day}`;
    const tags = mergeLearningTags(learnings);
    const type = mergeLearningType(learnings);
    const frontmatter = {
      distilledAt: now.toISOString(),
      runs: candidates.length,
      learnings: learnings.length,
    };
    let filedId = noteId;
    try {
      await this.vault.createNote({
        id: noteId,
        tier: "knowledge",
        title: `Destilace paměti — ${day}`,
        body: this.render(day, learnings),
        frontmatter,
        ...(type !== undefined ? { type } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        dedupe: true,
      });
    } catch (error) {
      if (error instanceof SimilarNoteError) {
        filedId = error.existingId;
        await this.vault.appendToNote(filedId, this.renderSections(learnings));
      } else if (error instanceof DuplicateNoteError) {
        // A second pass the same day appends (never replaces) so the morning's
        // learnings survive an evening top-up.
        await this.vault.appendToNote(noteId, this.renderSections(learnings));
      } else {
        throw error;
      }
    }

    const projectIds = [
      ...new Set(candidates.map((c) => c.projectId).filter((id): id is string => Boolean(id))),
    ];
    for (const projectId of projectIds) {
      await this.vault.updateIndex(projectId, filedId, `Destilace — ${day}`).catch((error) => {
        this.logger.warn(`could not link ${filedId} from ${projectId}: ${String(error)}`);
      });
    }
    await this.vault
      .appendDaily(
        `paměť destilována → [[${filedId}]] (${candidates.length} běhů, ${learnings.length} poznatků)`,
      )
      .catch((error) => this.logger.warn(`could not append daily distill line: ${String(error)}`));
  }

  private render(day: string, learnings: Learning[]): string {
    return [
      `Poznatky destilované z dokončených běhů (${day}).`,
      this.renderSections(learnings),
    ].join("\n\n");
  }

  private renderSections(learnings: Learning[]): string {
    return learnings.map((l) => `## ${l.title}\n\n${l.body}`).join("\n\n");
  }

  private async isDistilled(cwd: string): Promise<boolean> {
    return fileExists(path.join(cwd, MARKER));
  }

  private async markDistilled(cwd: string): Promise<void> {
    try {
      await writeFileAtomic(
        path.join(cwd, MARKER),
        JSON.stringify({ distilledAt: new Date().toISOString() }),
      );
    } catch (error) {
      // A run whose sandbox was already cleaned (deleted run) — nothing to mark.
      this.logger.warn(`could not write distiller marker at ${cwd}: ${String(error)}`);
    }
  }

  /** Resolve a persisted absolute project path to its registry id, or null. */
  private async byPath(projectPath: string | undefined): Promise<string | null> {
    if (!projectPath) return null;
    const all = await this.projects.list().catch((): Project[] => []);
    return all.find((p) => p.path === projectPath)?.id ?? null;
  }

  /** Resolve a free-form project label (id or exact name) to its id, or null. */
  private async byRef(ref: string): Promise<string | null> {
    if (!ref) return null;
    try {
      return (await this.projects.get(ref)).id;
    } catch {
      const all = await this.projects.list().catch((): Project[] => []);
      return all.find((p) => p.name === ref)?.id ?? null;
    }
  }
}
