import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  type ActivityKind,
  type ArtifactRecord,
  type ChainRun,
  ChainRunSchema,
  type PipelineRun,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ArtifactsStorageService } from "../artifacts/artifacts.storage.service";
import { VaultService } from "../memory/vault.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ChainsStorageService } from "./chains.storage.service";

export const CHAIN_RUNS_DIR = "CHAIN_RUNS_DIR";

export class ChainRunNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Chain run "${id}" not found`);
    this.name = "ChainRunNotFoundError";
  }
}

/**
 * Executes chains (N2b): completion-driven, artifact-mediated, linear.
 *
 * Step N runs as an ordinary pipeline run; when it reaches `done` the runner
 * looks up the durable artifact record the delivery sinks wrote (N2a), reads its
 * content, and starts step N+1 with it as the initial input handoff — the
 * pipeline-internal `produces` → `consumes` copy lifted to the run boundary. A
 * broken handoff (no consumable artifact, unreadable content, a `pr`-only
 * delivery) PARKS the run with a reason — a chain never crashes and never
 * silently skips a step. Failed step → chain `failed`; parked/limit-paused step
 * → chain `parked`, and the step later landing `done` (operator resumed it)
 * un-parks and advances.
 *
 * Every chain run is one JSON file on disk (files are the source of truth).
 * Boot reconciles a live chain from the ARTIFACT REGISTRY, not from runner
 * memory — the registry survives restarts and run eviction, so a step that
 * finished while the API was down still hands its work forward. A chain is a
 * bounded, operator-started sequence (finite steps, no loop), so boot-advance is
 * safe where a goal's unbounded reconstruct() parks (Phase 12.4 posture kept:
 * outward gates stay on the pipeline outputs themselves).
 */
@Injectable()
export class ChainRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string;
  private readonly runs = new Map<string, ChainRun>();
  private readonly log: ScopedLogger;
  private unsubscribe: (() => void) | null = null;
  /**
   * Transition queue: pipeline-run events are handled strictly one at a time.
   * Two near-simultaneous terminal events (or a boot reconcile racing a live
   * event) would otherwise interleave their read-modify-persist on the same
   * chain run. Also the test/shutdown seam ({@link settle}).
   */
  private queue: Promise<void> = Promise.resolve();
  /** Status push channel — mirrors PipelineRunnerService's `emit("status", run)`. */
  private readonly events = new EventEmitter();

  constructor(
    @Inject(CHAIN_RUNS_DIR) dir: string,
    private readonly chains: ChainsStorageService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly artifacts: ArtifactsStorageService,
    private readonly vault: VaultService,
    private readonly projects: ProjectsStorageService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.dir = path.resolve(dir);
    this.log = logger.child(ChainRunnerService.name);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.loadPersisted();
    this.unsubscribe = this.pipelineRunner.onRunStatus((run) => {
      this.enqueue(() => this.onPipelineTransition(run), run.pipelineRunId);
    });
    // Boot reconcile: a step that finished while the API was down left its
    // artifact record — advance from it. Queued like any transition; parking is
    // the fallback inside, never a crash.
    for (const run of this.runs.values()) {
      if (run.status === "running") {
        this.enqueue(() => this.reconcile(run), run.chainRunId);
      }
    }
  }

  /** Serialize a transition onto the queue; a failure logs and never breaks the chain of work. */
  private enqueue(work: () => Promise<void>, ref: string): void {
    this.queue = this.queue.then(work).catch((error) => {
      this.log.error("chain transition handler failed", {
        ref,
        err: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /** Await every queued transition — the deterministic test/shutdown seam. */
  async settle(): Promise<void> {
    await this.queue;
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Start a chain: step 0 runs now with the chain's instructions as its input. */
  async start(chainId: string, taskId?: string): Promise<ChainRun> {
    const chain = await this.chains.get(chainId); // throws → 404
    const startedMs = Date.now();
    const run: ChainRun = {
      chainRunId: `${chainId}_${startedMs}`,
      chainId,
      status: "running",
      currentStep: 0,
      steps: chain.steps.map((s, index) => ({
        index,
        pipeline: s.pipeline,
        status: "pending" as const,
      })),
      startedAt: new Date(startedMs).toISOString(),
      ...(taskId ? { taskId } : {}),
    };
    this.runs.set(run.chainRunId, run);
    await this.startStep(run, 0, chain.instructions ?? "");
    this.record(run, "chain-started", `chain ${chainId} started (${run.steps.length} steps)`);
    return run;
  }

  list(): ChainRun[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Subscribe to every chain run's status transitions (mirrors PipelineRunnerService.onRunStatus). */
  onRunStatus(listener: (run: ChainRun) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  /**
   * Chains never evict from memory (loadPersisted keeps every run), so this is
   * `list()` by another name — the shape TaskRunsService expects from every runner.
   */
  listAll(): ChainRun[] {
    return this.list();
  }

  get(chainRunId: string): ChainRun {
    const run = this.runs.get(chainRunId);
    if (!run) throw new ChainRunNotFoundError(chainRunId);
    return run;
  }

  // ── transitions ───────────────────────────────────────────────────────────

  /** Route a pipeline-run transition to the chain step (if any) waiting on it. */
  private async onPipelineTransition(pipeRun: PipelineRun): Promise<void> {
    for (const run of this.runs.values()) {
      if (run.status !== "running" && run.status !== "parked") continue;
      const step = run.steps.find((s) => s.runRef === pipeRun.pipelineRunId);
      if (!step || step.status !== "running") continue;
      if (pipeRun.status === "done") {
        await this.advance(run, step.index);
      } else if (pipeRun.status === "failed") {
        step.status = "failed";
        run.status = "failed";
        run.currentStep = null;
        await this.persist(run);
        this.record(
          run,
          "chain-finished",
          `chain failed — step ${step.index} (${step.pipeline}) failed`,
        );
      } else if (pipeRun.status === "parked" || pipeRun.status === "paused-limit") {
        // The step needs the operator (PR gate, retries park, usage limit). The
        // chain waits parked; the step's later `done` re-enters above and resumes.
        run.status = "parked";
        run.parkedReason = `step ${step.index} (${step.pipeline}) is ${pipeRun.status} — resume the pipeline run to continue the chain`;
        await this.persist(run);
        this.record(run, "chain-parked", `chain parked — ${run.parkedReason}`);
      }
      return;
    }
  }

  /**
   * Step `index` landed `done`: bind its artifact, then either finish the chain
   * or hand the artifact's content to the next step as its input.
   */
  private async advance(run: ChainRun, index: number): Promise<void> {
    const step = run.steps[index];
    if (!step || !step.runRef) return;
    const record = await this.consumableArtifact(step.runRef);
    step.status = "done";
    if (record) step.artifactId = record.id;
    // Un-park (a parked step was resumed and finished) before deciding the next move.
    if (run.status === "parked") {
      run.status = "running";
      run.parkedReason = undefined;
    }

    const isLast = index === run.steps.length - 1;
    if (isLast) {
      run.status = "done";
      run.currentStep = null;
      await this.persist(run);
      this.record(run, "chain-finished", `chain done — ${run.steps.length} steps delivered`);
      return;
    }

    if (!record) {
      run.status = "parked";
      run.parkedReason = `step ${index} (${step.pipeline}) delivered no consumable artifact (vault-note/project-file) to hand forward`;
      await this.persist(run);
      this.record(run, "chain-parked", `chain parked — ${run.parkedReason}`);
      return;
    }
    const content = await this.readArtifactContent(record);
    if (content === null) {
      run.status = "parked";
      run.parkedReason = `artifact "${record.id}" (${record.kind} → ${record.locator}) is unreadable`;
      await this.persist(run);
      this.record(run, "chain-parked", `chain parked — ${run.parkedReason}`);
      return;
    }
    await this.startStep(run, index + 1, content);
    this.record(
      run,
      "chain-advanced",
      `chain advanced — step ${index + 1} started with artifact "${record.id}"`,
    );
  }

  /** Spawn step `index`'s pipeline with `input` as its first handoff; persist. */
  private async startStep(run: ChainRun, index: number, input: string): Promise<void> {
    const step = run.steps[index];
    if (!step) return;
    const pipeRun = await this.pipelineRunner.start(
      step.pipeline,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      input,
    );
    step.runRef = pipeRun.pipelineRunId;
    step.status = "running";
    run.currentStep = index;
    await this.persist(run);
  }

  /**
   * Boot reconcile for a `running` chain: the registry is the durable truth.
   * Current step's artifact exists → the step finished while we were down →
   * advance. No artifact and the pipeline run is gone → park (never guess).
   * Still live in the runner → the subscription will hear its terminal event.
   */
  private async reconcile(run: ChainRun): Promise<void> {
    const index = run.currentStep;
    if (index === null) return;
    const step = run.steps[index];
    if (!step?.runRef) return;
    if (await this.consumableArtifact(step.runRef)) {
      await this.advance(run, index);
      return;
    }
    const live = await Promise.resolve()
      .then(() => this.pipelineRunner.get(step.runRef as string))
      .catch(() => null);
    if (!live) {
      run.status = "parked";
      run.parkedReason = `step ${index} (${step.pipeline}) run "${step.runRef}" was lost across a restart and left no artifact`;
      await this.persist(run);
      this.record(run, "chain-parked", `chain parked — ${run.parkedReason}`);
    } else if (live.status === "done") {
      // Terminal without a consumable artifact (e.g. pr-only) — advance() handles
      // the park-vs-finish decision uniformly.
      await this.advance(run, index);
    }
    // Otherwise: still running/parked — the status subscription owns the next move.
  }

  // ── artifact plumbing ─────────────────────────────────────────────────────

  /** The step's consumable delivery record — `pr` is a gate, not a handoff. */
  private async consumableArtifact(runRef: string): Promise<ArtifactRecord | null> {
    const all = await this.artifacts.list().catch((): ArtifactRecord[] => []);
    return all.find((r) => r.producedBy.runRef === runRef && r.kind !== "pr") ?? null;
  }

  /** Resolve a record to its content: vault note body or project file text. */
  private async readArtifactContent(record: ArtifactRecord): Promise<string | null> {
    if (record.kind === "vault-note") {
      const note = await this.vault.note(record.locator).catch(() => null);
      return note?.body ?? null;
    }
    if (record.kind === "project-file") {
      const projectId = record.producedBy.projectId;
      if (!projectId) return null;
      const project = await this.projects.get(projectId).catch(() => null);
      if (!project?.path) return null; // no local path on this machine — nothing to read
      return fs.readFile(path.join(project.path, record.locator), "utf8").catch(() => null);
    }
    return null;
  }

  // ── persistence ───────────────────────────────────────────────────────────

  private async persist(run: ChainRun): Promise<void> {
    await writeFileAtomic(
      path.join(this.dir, `${run.chainRunId}.json`),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    // Single transit point for every mutation (start/advance/onPipelineTransition/
    // reconcile) — emit here so the outcome write-back subscription hears each one.
    this.events.emit("status", run);
  }

  private async loadPersisted(): Promise<void> {
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null);
      if (raw === null) continue;
      const parsed = ChainRunSchema.safeParse(safeJson(raw));
      if (parsed.success) this.runs.set(parsed.data.chainRunId, parsed.data);
    }
  }

  /** Activity is the chain's audit trail (Law 5) — never throws, fire-and-forget. */
  private record(run: ChainRun, kind: ActivityKind, summary: string): void {
    void this.activity.record({
      kind,
      summary,
      refs: { chainRunId: run.chainRunId, chainId: run.chainId, status: run.status },
    });
  }
}
