import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { AgentRun, GoalRun, Note, NoteType, PipelineRun, Project } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ChatTranscriptStore } from "../chat/chat-transcript.store";
import { fileExists, writeFileAtomic } from "../shared/file-storage/file-utils";
import { ClaudeCliDistiller, type Learning, type RunDigest } from "./claude-cli-distiller";
import { MemoryImportService } from "./memory-import.service";
import {
  DuplicateNoteError,
  SimilarNoteError,
  VaultService,
  ownerProjectOf,
} from "./vault.service";

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
  /**
   * Set for a raw ("halda") vault note (Fáze 107) — like `chatId`, a note has no
   * run `cwd` either. Marks this candidate for the DEDICATED per-note triage path
   * in {@link MemoryDistillerService.distill} rather than the batch digest flow;
   * idempotency is the note's own `triagedAt` frontmatter, not a marker file.
   */
  noteId?: string;
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
    private readonly importer: MemoryImportService,
  ) {}

  /**
   * Run one distillation pass; returns a `memory-distill:<count>` ref. NEVER throws —
   * the scheduler tick must survive a bad model call or a missing artifact, so every
   * failure is swallowed (fail-open, like the briefer).
   */
  async distill(now: Date = new Date()): Promise<string> {
    // Front-phase (phase 112): ingest anything already staged in the halda import
    // queue BEFORE gathering candidates below, so the freshly-created raw notes
    // are present for `triageRawNotes()` later in this SAME pass — no separate
    // triage code needed, the existing sweep just sees more raw notes. Fail-open:
    // an ingest error must never abort the nightly tick.
    try {
      await this.importer.ingestQueue();
    } catch (error) {
      this.logger.warn(`import ingest failed: ${String(error)}`);
    }

    try {
      const all = await this.gather();
      // Raw vault notes (Fáze 107) take a DEDICATED per-note triage path — they
      // have no run `cwd` and their fate (durable/noise) is decided individually,
      // not merged into the shared run/chat digest below.
      const runCandidates = all.filter((c) => c.noteId === undefined);
      const noteCandidates = all.filter((c) => c.noteId !== undefined);

      let learningsCount = 0;
      if (runCandidates.length > 0) {
        const learnings = await this.distiller.distill(runCandidates.map((c) => c.summary));
        if (learnings.length > 0) await this.fileDigest(now, learnings, runCandidates);

        // Mark only AFTER the digest is filed: a crash before this re-considers
        // the batch next pass (at-least-once — a duplicated digest line is
        // harmless, a silently dropped learning is not).
        await Promise.all(
          runCandidates.map((c) =>
            c.chatId !== undefined
              ? this.chat.markDistilled(c.chatId, c.chatCount ?? 0, now)
              : this.markDistilled(c.cwd),
          ),
        );
        learningsCount = learnings.length;
      }

      const triagedCount =
        noteCandidates.length > 0 ? await this.triageRawNotes(noteCandidates, now) : 0;

      const total = runCandidates.length + noteCandidates.length;
      if (total === 0) return "memory-distill:0";
      this.logger.log(
        `distilled ${runCandidates.length} run(s) → ${learningsCount} learning(s); triaged ${triagedCount}/${noteCandidates.length} raw note(s)`,
      );
      return `memory-distill:${total}`;
    } catch (error) {
      this.logger.warn(`memory distillation failed: ${String(error)}`);
      return "memory-distill:error";
    }
  }

  /**
   * Terminal, not-yet-distilled runs across all three runners + incremental chats
   * + raw ("halda") vault notes pending triage (Fáze 107) — capped per pass. All
   * four sources share the SAME `MAX_RUNS_PER_PASS` cap and defer-never-drop
   * posture: overflow is deferred (logged), never silently dropped.
   */
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
      out.push({
        cwd: "",
        projectId: null,
        chatId: id,
        chatCount: summary.count,
        summary: summary.digest,
      });
    }

    // Raw ("halda") notes: idempotency is the note's own `triagedAt` frontmatter
    // (a note has no run `cwd` for the file marker) — skip anything already
    // triaged before it ever reaches the cap check.
    for (const note of await this.vault.rawNotes().catch((): Note[] => [])) {
      if (note.frontmatter?.triagedAt !== undefined) continue;
      if (out.length >= MAX_RUNS_PER_PASS) {
        deferred++;
        continue;
      }
      out.push({
        cwd: "",
        projectId: ownerProjectOf(note.frontmatter ?? {}) ?? null,
        noteId: note.id,
        summary: {
          kind: "note",
          id: note.id,
          name: note.title,
          status: "raw",
          excerpt: (note.body ?? "").slice(0, EXCERPT_LIMIT),
        },
      });
    }

    if (deferred > 0) {
      this.logger.log(`distill cap reached — deferring ${deferred} run(s) to the next pass`);
    }
    return out;
  }

  private async summarizePipeline(run: PipelineRun, projectId: string | null): Promise<RunDigest> {
    // No fixed artifact-name list: `readLatestArtifact` walks the PIPELINE'S OWN
    // phases (reverse order) so a non-delivery shape — research, audit, whatever
    // a future pipeline produces — is distilled too, not just the delivery loop.
    const artifact = await this.pipelines.readLatestArtifact(run.pipelineRunId).catch(() => null);
    const excerpt = artifact?.content.slice(0, EXCERPT_LIMIT) ?? "";
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

  /**
   * Triage every raw-note candidate in turn (Fáze 107). FAIL-OPEN per note: a
   * single failure (thrown by the triage call itself or by the vault write) is
   * logged and skipped — the note is left untouched (no `triagedAt`, so it is
   * reconsidered next pass) rather than aborting the rest of the batch.
   */
  private async triageRawNotes(candidates: Candidate[], now: Date): Promise<number> {
    let triaged = 0;
    for (const candidate of candidates) {
      if (!candidate.noteId) continue;
      try {
        await this.triageOne(candidate.noteId, candidate.summary, candidate.projectId, now);
        triaged++;
      } catch (error) {
        this.logger.warn(`raw-note triage failed for ${candidate.noteId}: ${String(error)}`);
      }
    }
    return triaged;
  }

  /**
   * Triage one raw note: durable → condense body/title/type/tags in place, clear
   * `raw`, link related notes; noise → clear `raw`, tag `triaged-noise`. Either
   * way the note gets a `triagedAt` stamp (idempotency — see {@link gather}) and
   * exactly one daily line. NEVER deletes the note. A `null` verdict (model
   * unavailable/unparsable — mirrors {@link ClaudeCliDistiller.distill}'s own
   * empty-learnings fallback) is treated as noise rather than left to retry
   * forever.
   */
  private async triageOne(
    noteId: string,
    digest: RunDigest,
    projectId: string | null,
    now: Date,
  ): Promise<void> {
    const stamp = now.toISOString();
    const verdict = await this.distiller.triageNote({
      id: noteId,
      title: digest.name,
      body: digest.excerpt,
    });

    if (!verdict || verdict.verdict === "noise") {
      const tags = [...new Set([...(verdict?.tags ?? []), "triaged-noise"])];
      await this.vault.updateNote(noteId, { frontmatter: { triagedAt: stamp, raw: false, tags } });
      await this.vault
        .appendDaily(`poznámka [[${noteId}]] vytříděna jako šum`)
        .catch((error) => this.logger.warn(`could not append daily triage line: ${String(error)}`));
      return;
    }

    await this.vault.updateNote(noteId, {
      title: verdict.title,
      body: verdict.body,
      frontmatter: {
        triagedAt: stamp,
        raw: false,
        ...(verdict.type !== undefined ? { type: verdict.type } : {}),
        ...(verdict.tags.length > 0 ? { tags: verdict.tags } : {}),
      },
    });
    await this.linkRelated(noteId, projectId, verdict.title, verdict.tags);
    await this.vault
      .appendDaily(`poznámka [[${noteId}]] vytříděna do paměti`)
      .catch((error) => this.logger.warn(`could not append daily triage line: ${String(error)}`));
  }

  /**
   * Link a freshly-triaged durable note into the vault graph (Fáze 107). When
   * the note has an owning project, reuse the exact `updateIndex` MOC call
   * {@link fileDigest} uses. Otherwise fall back to `search()` restricted to
   * `index()`'s entry points (the vault's MOCs) — the first topical match, by
   * title/tags, gets a `[[noteId]]` line. Best-effort: a miss or a lookup
   * failure is silently a no-op, never surfaced to the caller.
   */
  private async linkRelated(
    noteId: string,
    projectId: string | null,
    title: string,
    tags: string[],
  ): Promise<void> {
    if (projectId) {
      await this.vault.updateIndex(projectId, noteId, "Vytříděno z paměti").catch((error) => {
        this.logger.warn(`could not link ${noteId} from ${projectId}: ${String(error)}`);
      });
      return;
    }
    const query = [title, ...tags].filter(Boolean).join(" ").trim();
    if (!query) return;
    try {
      const [entries, hits] = await Promise.all([this.vault.index(), this.vault.search(query)]);
      const mocIds = new Set(entries.map((e) => e.id));
      const target = hits.find((h) => h.id !== noteId && mocIds.has(h.id));
      if (!target) return;
      await this.vault.updateIndex(target.id, noteId).catch((error) => {
        this.logger.warn(`could not link ${noteId} from ${target.id}: ${String(error)}`);
      });
    } catch (error) {
      this.logger.warn(`related-note lookup failed for ${noteId}: ${String(error)}`);
    }
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
