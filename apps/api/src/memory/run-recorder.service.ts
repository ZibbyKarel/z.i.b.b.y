import * as path from "node:path";
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { AgentRun, PipelineRun, Project } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { fileExists, writeFileAtomic } from "../shared/file-storage/file-utils";
import { DuplicateNoteError, SimilarNoteError, VaultService } from "./vault.service";

/** Marker file written into a run's cwd once it has been recorded (at-most-once). */
const MARKER = "memory-recorded.json";

/** Agent run statuses that are terminal (the run is finished and won't change). */
const TERMINAL_AGENT = new Set<AgentRun["status"]>(["done", "error", "interrupted"]);
/** Pipeline run statuses that are terminal. `parked` is a pause, not an end. */
const TERMINAL_PIPELINE = new Set<PipelineRun["status"]>(["done", "failed"]);

/**
 * Writes a durable trace of every finished run into the vault's episodic `daily/`
 * note (Phase 4): the second half of the run lifecycle (ground → work → **record**).
 * Mirrors {@link TaskSchedulerService}'s outcome write-back — subscribe to both
 * runners on init, sweep their lists on bootstrap (a run that finished across a
 * restart is rebuilt from disk WITHOUT re-emitting its terminal status, so the
 * subscription alone would miss it).
 *
 * Lives in its own module above Memory/Agents/Pipelines: grounding makes
 * Agents/Pipelines → Memory an edge, so the recorder (which needs the reverse) can
 * never live inside MemoryModule without a DI cycle.
 *
 * Idempotency is at-most-once: a marker file is written into the run's cwd BEFORE
 * the vault writes, so a crash mid-record loses at most one daily line but can
 * never duplicate one (the daily append has no dedup of its own).
 */
@Injectable()
export class RunRecorderService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RunRecorderService.name);
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly vault: VaultService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly projects: ProjectsStorageService,
  ) {}

  onModuleInit(): void {
    this.unsubscribers.push(
      this.agentRunner.onRunStatus((run) => {
        if (TERMINAL_AGENT.has(run.status)) void this.recordAgent(run);
      }),
      this.pipelineRunner.onRunStatus((run) => {
        if (TERMINAL_PIPELINE.has(run.status)) void this.recordPipeline(run);
      }),
    );
  }

  /**
   * Sweep both runners for terminal runs that finished without being recorded —
   * the load-bearing path for runs that ended across a restart (init rebuilds them
   * from disk but does not re-emit their terminal status).
   */
  async onApplicationBootstrap(): Promise<void> {
    for (const run of this.agentRunner.listRunning()) {
      if (TERMINAL_AGENT.has(run.status)) await this.recordAgent(run);
    }
    for (const run of this.pipelineRunner.list()) {
      if (TERMINAL_PIPELINE.has(run.status)) await this.recordPipeline(run);
    }
  }

  onModuleDestroy(): void {
    for (const unsub of this.unsubscribers.splice(0)) unsub();
  }

  /** Reserve a run for recording: skip if already done, else write the marker first. */
  private async claim(cwd: string): Promise<boolean> {
    const marker = path.join(cwd, MARKER);
    if (await fileExists(marker)) return false;
    try {
      await writeFileAtomic(marker, JSON.stringify({ recordedAt: new Date().toISOString() }));
      return true;
    } catch (error) {
      // A run whose sandbox was already cleaned (deleted run) — nothing to record.
      this.logger.warn(`could not write recorder marker at ${marker}: ${String(error)}`);
      return false;
    }
  }

  private async recordAgent(run: AgentRun): Promise<void> {
    if (!(await this.claim(run.cwd))) return;
    try {
      const projectId = await this.resolveProjectRef(run.project);
      const title = run.title ? ` ${run.title}` : "";
      const link = projectId ? ` · [[${projectId}]]` : "";
      await this.vault.appendDaily(
        `run ${run.runId} (${run.agentId})${title} → ${run.status}${link}`,
      );
    } catch (error) {
      this.logger.warn(`failed to record agent run ${run.runId}: ${String(error)}`);
    }
  }

  private async recordPipeline(run: PipelineRun): Promise<void> {
    if (!(await this.claim(run.cwd))) return;
    try {
      const projectId = await this.resolveProjectByPath(run.projectPath);
      // On a successful delivery, file the dokumentator's learned.md as a durable
      // knowledge note and link it from the project MOC.
      const learnedId = run.status === "done" ? await this.fileLearned(run, projectId) : null;

      const links: string[] = [];
      if (projectId) links.push(`[[${projectId}]]`);
      if (learnedId) links.push(`[[${learnedId}]]`);
      const suffix = links.length ? ` · ${links.join(" ")}` : "";
      const stages = run.stageRuns.length;
      await this.vault.appendDaily(
        `pipeline ${run.pipelineRunId} (${run.pipelineId}) → ${run.status} · ${stages} stages${suffix}`,
      );
    } catch (error) {
      this.logger.warn(`failed to record pipeline run ${run.pipelineRunId}: ${String(error)}`);
    }
  }

  /**
   * Fetch the run's learned.md artifact and file it as `learned-<runId>` in
   * `knowledge/`, linked from the project MOC. Returns the note id, or null when
   * there was no learned.md (older agent, demo run without the knob).
   *
   * `createNote` runs with `dedupe: true` (Fáze 3): a run of the SAME pipeline
   * whose learned.md scores as a near-duplicate of an earlier run's note
   * (`SimilarNoteError`) merges into that EXISTING note instead of filing a new
   * one — the link/return id points at it. `tags` carries the pipeline (and
   * project, when known) so `findSimilar`'s tag-overlap term actually has a signal
   * to compare across two runs of the same pipeline (title + body overlap alone
   * caps at 0.7, under `SIMILARITY_THRESHOLD`). An exact id collision
   * (`DuplicateNoteError`, sweep + subscription racing the same run) keeps the
   * previous tolerant no-op.
   */
  private async fileLearned(run: PipelineRun, projectId: string | null): Promise<string | null> {
    const artifact = await this.pipelineRunner
      .readArtifact(run.pipelineRunId, "learned.md")
      .catch(() => null);
    if (!artifact?.content.trim()) return null;
    const id = `learned-${run.pipelineRunId}`;
    const tags = [run.pipelineId, ...(projectId ? [projectId] : [])];
    let filedId = id;
    try {
      await this.vault.createNote({
        id,
        tier: "knowledge",
        title: `Learned — ${run.pipelineId}`,
        body: artifact.content,
        frontmatter: {
          source: run.pipelineRunId,
          pipeline: run.pipelineId,
          ...(projectId ? { project: projectId } : {}),
        },
        tags,
        dedupe: true,
      });
    } catch (error) {
      if (error instanceof SimilarNoteError) {
        filedId = error.existingId;
        await this.vault.appendToNote(filedId, artifact.content);
      } else if (!(error instanceof DuplicateNoteError)) {
        throw error;
      }
    }
    if (projectId) {
      await this.vault
        .updateIndex(projectId, filedId, `Learned — ${run.pipelineId}`)
        .catch((error) => {
          this.logger.warn(`could not link ${filedId} from ${projectId}: ${String(error)}`);
        });
    }
    return filedId;
  }

  /** Resolve a free-form project label (id or exact name) to its id, or null. */
  private async resolveProjectRef(ref: string): Promise<string | null> {
    if (!ref) return null;
    try {
      return (await this.projects.get(ref)).id;
    } catch {
      const all = await this.projects.list().catch((): Project[] => []);
      return all.find((p) => p.name === ref)?.id ?? null;
    }
  }

  /** Resolve a persisted absolute project path to its registry id, or null. */
  private async resolveProjectByPath(projectPath: string | undefined): Promise<string | null> {
    if (!projectPath) return null;
    const all = await this.projects.list().catch((): Project[] => []);
    return all.find((p) => p.path === projectPath)?.id ?? null;
  }
}
