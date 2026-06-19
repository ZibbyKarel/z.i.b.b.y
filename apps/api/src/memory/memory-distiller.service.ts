import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { AgentRun, GoalRun, PipelineRun, Project } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { fileExists, writeFileAtomic } from "../shared/file-storage/file-utils";
import { ClaudeCliDistiller, type Learning, type RunDigest } from "./claude-cli-distiller";
import { DuplicateNoteError, VaultService } from "./vault.service";

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
      await Promise.all(candidates.map((c) => this.markDistilled(c.cwd)));
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

  /** File the batch as one digest knowledge note + link it from each project MOC. */
  private async fileDigest(
    now: Date,
    learnings: Learning[],
    candidates: Candidate[],
  ): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    const noteId = `distilled-${day}`;
    const frontmatter = {
      distilledAt: now.toISOString(),
      runs: candidates.length,
      learnings: learnings.length,
    };
    try {
      await this.vault.createNote({
        id: noteId,
        tier: "knowledge",
        title: `Destilace paměti — ${day}`,
        body: this.render(day, learnings),
        frontmatter,
      });
    } catch (error) {
      // A second pass the same day appends (never replaces) so the morning's
      // learnings survive an evening top-up.
      if (!(error instanceof DuplicateNoteError)) throw error;
      await this.vault.appendToNote(noteId, this.renderSections(learnings));
    }

    const projectIds = [
      ...new Set(candidates.map((c) => c.projectId).filter((id): id is string => Boolean(id))),
    ];
    for (const projectId of projectIds) {
      await this.vault.updateIndex(projectId, noteId, `Destilace — ${day}`).catch((error) => {
        this.logger.warn(`could not link ${noteId} from ${projectId}: ${String(error)}`);
      });
    }
    await this.vault
      .appendDaily(
        `paměť destilována → [[${noteId}]] (${candidates.length} běhů, ${learnings.length} poznatků)`,
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
