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
import { AgentsStorageService } from "../agents/agents.storage.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { fileExists, writeFileAtomic } from "../shared/file-storage/file-utils";
import { shelfDailyLink } from "./subsystem-shelf";
import { VaultService } from "./vault.service";

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
    private readonly agentsStore: AgentsStorageService,
    private readonly pipelinesStore: PipelinesStorageService,
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
      // F4a: an owned run also links its subsystem's shelf — an unowned run (or a
      // lookup failure) is silently skipped, never fails the recording.
      const owner = (await this.agentsStore.get(run.agentId).catch(() => null))?.ownerSubsystem;
      const shelf = owner ? ` · ${shelfDailyLink(owner)}` : "";
      await this.vault.appendDaily(
        `run ${run.runId} (${run.agentId})${title} → ${run.status}${link}${shelf}`,
      );
    } catch (error) {
      this.logger.warn(`failed to record agent run ${run.runId}: ${String(error)}`);
    }
  }

  private async recordPipeline(run: PipelineRun): Promise<void> {
    if (!(await this.claim(run.cwd))) return;
    try {
      const projectId = await this.resolveProjectByPath(run.projectPath);
      const suffix = projectId ? ` · [[${projectId}]]` : "";
      const stages = run.stageRuns.length;
      const owner = (await this.pipelinesStore.get(run.pipelineId).catch(() => null))
        ?.ownerSubsystem;
      const shelf = owner ? ` · ${shelfDailyLink(owner)}` : "";
      await this.vault.appendDaily(
        `pipeline ${run.pipelineRunId} (${run.pipelineId}) → ${run.status} · ${stages} stages${suffix}${shelf}`,
      );
    } catch (error) {
      this.logger.warn(`failed to record pipeline run ${run.pipelineRunId}: ${String(error)}`);
    }
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
