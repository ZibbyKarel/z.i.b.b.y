import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ActivityLogService } from "../activity/activity-log.service";
import { GRAPH_REPORT_PATH } from "../self-knowledge/self-knowledge.service";
import { parseGraphReport } from "../self-knowledge/graph-report.parser";
import { exec } from "../shared/git-exec";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { installRoot } from "../shared/data-dir";
import { subsystemShelfId } from "../memory/subsystem-shelf";
import { VaultService } from "../memory/vault.service";
import { SubsystemFindingsStore } from "../subsystems/subsystem-findings.store";

/** The narrow slice of `exec`'s signature this service actually calls — matches
 *  `promisify(execFile)`'s shape, injectable for tests (same posture as the
 *  Sentinel/Maestro services' optional `fetchImpl`). */
type ExecImpl = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

/** The findings-store snapshot key + the vault note id (gap-detector's note pattern). */
const FINDINGS_KEY = "loom";
const NOTE_ID = "suggestions/quality-findings";

/** A "god node" — a symbol with an outsized number of edges in the graphify report. */
const GOD_NODE_DEGREE_THRESHOLD = 25;
/** An oversized community — too many nodes clustered under one label. */
const COMMUNITY_SIZE_THRESHOLD = 40;
/** `madge --circular` is scoped to `apps/web` only (correction #1 — matches `check:cycles`). */
const MADGE_TARGET = "apps/web";
const MADGE_TIMEOUT_MS = 60_000;

/** A god node in the dependency graph (too many incoming/outgoing edges). */
export interface LoomGodNodeFinding {
  kind: "god-node";
  fingerprint: string;
  name: string;
  degree: number;
}

/** An oversized community cluster in the dependency graph. */
export interface LoomCommunityFinding {
  kind: "community";
  fingerprint: string;
  label: string;
  size: number;
}

/** A circular dependency chain reported by madge. */
export interface LoomCycleFinding {
  kind: "cycle";
  fingerprint: string;
  members: string[];
}

export type LoomFinding = LoomGodNodeFinding | LoomCommunityFinding | LoomCycleFinding;

/** Sha1 hex digest — the cycle fingerprint's collision-resistant tail. */
function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

/** One human line for the vault note / briefing. */
function toFindingLine(finding: LoomFinding): string {
  if (finding.kind === "god-node") return `god node: ${finding.name} (degree ${finding.degree})`;
  if (finding.kind === "community")
    return `oversized community: ${finding.label} (${finding.size} nodes)`;
  return `circular dependency: ${finding.members.join(" → ")}`;
}

/** Tolerant shape of `madge --circular --json`'s output: an array of cycle chains. */
type MadgeCircularOutput = string[][];

/**
 * NS2 F5c — Loom's nightly quality audit over ZIBBY itself: graphify's
 * god-node/community report (already parsed by `SelfKnowledgeService`'s
 * `parseGraphReport`) plus a madge circular-dependency check (scoped to
 * `apps/web`, matching the existing `check:cycles` script — knip is deferred,
 * not installed). Findings are a vault-note proposal (gap-detector's pattern)
 * filed onto Loom's shelf and read back for the briefing. No task dispatch in
 * v1 — Loom's findings are proposals to Forge; turning one into work is an
 * operator decision ("proposes ≠ acts", same posture as gap-detect).
 * Fail-open everywhere: a missing report or a failing/absent madge binary
 * both degrade to "that source skipped", never a thrown error out of the
 * scheduler's tick.
 */
@Injectable()
export class LoomService {
  private readonly execImpl: ExecImpl;
  private readonly log: ScopedLogger;

  constructor(
    private readonly vault: VaultService,
    private readonly findingsStore: SubsystemFindingsStore,
    private readonly activity: ActivityLogService,
    @Inject(GRAPH_REPORT_PATH) private readonly graphReportPath: string,
    logger: LoggerService,
    @Optional() execImpl?: ExecImpl,
  ) {
    this.execImpl = execImpl ?? exec;
    this.log = logger.child(LoomService.name);
  }

  /** Audit ZIBBY itself for quality drift: god nodes/communities + circular deps. */
  async audit(now: Date = new Date()): Promise<{ findings: LoomFinding[] }> {
    const findings: LoomFinding[] = [
      ...(await this.auditGraphify()),
      ...(await this.auditCycles()),
    ];

    const currentFingerprints = new Set(findings.map((f) => f.fingerprint));
    const lastFingerprints = await this.findingsStore.read(FINDINGS_KEY);
    const newFindings = findings.filter((f) => !lastFingerprints.has(f.fingerprint));
    const changed =
      currentFingerprints.size !== lastFingerprints.size ||
      [...currentFingerprints].some((fp) => !lastFingerprints.has(fp));

    if (!changed) {
      this.log.info("loom: no new findings");
      await this.findingsStore.write(FINDINGS_KEY, currentFingerprints);
      return { findings };
    }

    await this.writeFindings(findings, now).catch((err) => {
      this.log.warn("loom: failed to write findings to vault", { error: String(err) });
    });
    await this.vault
      .updateIndex(
        subsystemShelfId("loom"),
        NOTE_ID,
        `Audit kvality — ${now.toISOString().slice(0, 10)}`,
      )
      .catch(() => {});
    await this.findingsStore.write(FINDINGS_KEY, currentFingerprints);
    void this.activity.record({
      kind: "subsystem-scan",
      summary: `Loom: ${newFindings.length} nových nálezů kvality`,
      refs: { noteId: NOTE_ID },
    });

    return { findings };
  }

  /** Read the latest quality findings from the vault (for the briefing). */
  async readFindings(): Promise<string[]> {
    try {
      const note = await this.vault.note(NOTE_ID);
      return (note.body ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
        .map((l) => l.replace(/^- \[.\] /, "").trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private async auditGraphify(): Promise<LoomFinding[]> {
    let markdown: string;
    try {
      markdown = await fs.readFile(this.graphReportPath, "utf8");
    } catch (err) {
      // graphify-out/ is gitignored and routinely absent — "not available", not an
      // error. Keeping the report current is the existing `graphify update .` hook,
      // never this service's job.
      this.log.debug("loom: graph report unavailable — skipping graphify source", {
        error: String(err),
      });
      return [];
    }

    const { godNodes, communities } = parseGraphReport(markdown);
    const findings: LoomFinding[] = [];
    for (const node of godNodes) {
      if (node.degree === undefined || node.degree < GOD_NODE_DEGREE_THRESHOLD) continue;
      findings.push({
        kind: "god-node",
        fingerprint: `godnode-${node.name}`,
        name: node.name,
        degree: node.degree,
      });
    }
    for (const community of communities) {
      if (community.size === undefined || community.size < COMMUNITY_SIZE_THRESHOLD) continue;
      findings.push({
        kind: "community",
        fingerprint: `community-${community.label}`,
        label: community.label,
        size: community.size,
      });
    }
    return findings;
  }

  private async auditCycles(): Promise<LoomFinding[]> {
    let stdout: string;
    try {
      const result = await this.execImpl(
        "pnpm",
        ["exec", "madge", "--circular", "--json", MADGE_TARGET],
        { cwd: installRoot(), timeout: MADGE_TIMEOUT_MS },
      );
      stdout = result.stdout;
    } catch (err) {
      // Non-zero exit, missing binary, or a timeout — all fail-open. `madge --circular`
      // itself exits non-zero when it FINDS cycles, so a thrown error here can still
      // carry the JSON on stdout (execFile attaches it to the error object); best-effort
      // recover it before giving up on the source entirely.
      const stdoutFromError = (err as { stdout?: string }).stdout;
      if (typeof stdoutFromError === "string" && stdoutFromError.trim().length > 0) {
        stdout = stdoutFromError;
      } else {
        this.log.debug("loom: madge unavailable — skipping cycle source", { error: String(err) });
        return [];
      }
    }

    let cycles: MadgeCircularOutput;
    try {
      const parsed = JSON.parse(stdout) as unknown;
      cycles = Array.isArray(parsed) ? parsed.filter((c): c is string[] => Array.isArray(c)) : [];
    } catch {
      this.log.debug("loom: madge output was not valid JSON — skipping cycle source");
      return [];
    }

    return cycles.map((members) => {
      const sorted = [...members].sort();
      return {
        kind: "cycle" as const,
        fingerprint: `cycle-${sha1(sorted.join("|"))}`,
        members,
      };
    });
  }

  private async writeFindings(findings: LoomFinding[], now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10);
    const lines = findings.map(toFindingLine);
    const body = [
      `*Updated: ${date}*`,
      "",
      "Open code-quality findings (god nodes, oversized communities, circular deps):",
      "",
      ...lines.map((l) => `- [ ] ${l}`),
      "",
      "_These are proposals to Forge — approve a line to turn it into work._",
    ].join("\n");
    try {
      await this.vault.updateNote(NOTE_ID, { body });
    } catch {
      await this.vault.createNote({
        id: NOTE_ID,
        title: "Quality Findings",
        tier: "memory",
        body,
      });
    }
  }
}
