import { Inject, Injectable } from "@nestjs/common";
import {
  type ClassifyTaskInput,
  type MakerRef,
  ORCHESTRATOR_TARGET,
  type Pipeline,
  type ProposedGoal,
  type ResolvedPath,
  type TaskRouting,
  TaskRoutingSchema,
  type TaskTarget,
} from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { matchProject } from "../projects/project-matcher";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { KeywordScorer, detectLoopCue } from "./keyword-scorer";
import { type RoutableTarget, TASK_ROUTER, type TaskRouter, toTaskTarget } from "./task-router";

/**
 * Keyword-scorer confidence below which the verdict is not trusted to name a
 * specific agent/pipeline and the task routes to the orchestrator instead. The
 * scorer reports 0.22 for a zero-term match and ≥ 0.55 from the first matched
 * term, so 0.5 separates "guessed the top catalog entry" from "actually matched".
 */
export const ORCHESTRATOR_FALLBACK_THRESHOLD = 0.5;

/**
 * Phase 11: the iteration fuse a synthesized loop proposes by default. The operator
 * can edit it in the dialog's "Edit" disclosure before submit; it only ever caps a
 * proposal, never an existing goal.
 */
export const DEFAULT_GOAL_ITERATIONS = 6;

/**
 * Classifies a free-text task to a stored agent or pipeline. It builds the
 * candidate catalog from the file-backed stores, asks the primary {@link TaskRouter}
 * (the `claude -p` AI categorizer) to pick a target, and falls back to the
 * deterministic {@link KeywordScorer} whenever the router is unavailable, times
 * out, errors, or returns an incoherent verdict. The result is side-effect-free —
 * starting a run is a separate, explicit step (approval-first).
 *
 * "No match" is impossible: when the LLM router fails AND the keyword scorer's
 * confidence falls below {@link ORCHESTRATOR_FALLBACK_THRESHOLD}, the terminal
 * rule routes the task to the orchestrator (`kind: "orchestrator"`), which has
 * every agent as a delegatable subagent and can also do the task directly.
 *
 * Returns `null` only when the catalog is genuinely empty (the controller maps
 * that to 422); every other failure is absorbed into the fallbacks, so the
 * endpoint never hard-fails.
 */
@Injectable()
export class TaskClassifierService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly agents: AgentsStorageService,
    private readonly pipelines: PipelinesStorageService,
    @Inject(TASK_ROUTER) private readonly router: TaskRouter,
    private readonly fallback: KeywordScorer,
    private readonly projects: ProjectsStorageService,
    logger: LoggerService,
  ) {
    this.log = logger.child(TaskClassifierService.name);
  }

  async classify(input: ClassifyTaskInput): Promise<TaskRouting | null> {
    const candidates = await this.buildCandidates();
    if (candidates.length === 0) return null;

    const base = await this.route(input, candidates);
    return this.enrich(base, input, candidates);
  }

  /**
   * Phase 91 — classify a task within ONE subsystem's owned pipelines only: the
   * design doc's "recursive scoped routing", the same {@link route}/{@link isCoherent}
   * machinery reused with a candidate catalog restricted to the owned pipelines (never
   * agents, never the full catalog). Called only for the N-owned case (2+ pipelines);
   * the caller (`TaskSchedulerService`'s subsystem dispatch) resolves 0/1 owned
   * pipelines itself without a classify round-trip. The terminal fallback for "nothing
   * matched confidently" is the FIRST owned pipeline (registry/file order) — never the
   * global orchestrator, because the operator already named the subsystem (scope
   * guard: `docs/plans/phase-91-subsystem-dispatch.md`). Returns `null` only when
   * `ownedPipelineIds` resolves to zero live pipelines (defensive — the caller never
   * invokes this with an empty set).
   */
  async classifyWithinSubsystem(
    input: ClassifyTaskInput,
    ownedPipelineIds: readonly string[],
  ): Promise<TaskRouting | null> {
    const allPipelines = await this.pipelines.list().catch((): Pipeline[] => []);
    const owned = allPipelines.filter((p) => ownedPipelineIds.includes(p.id));
    const candidates = this.pipelineCandidates(owned);
    const first = candidates[0];
    if (!first) return null;

    const base = await this.route(input, candidates, {
      target: toTaskTarget(first),
      reason: "No pipeline matched confidently — routed to the subsystem's first pipeline.",
    });
    return this.enrich(base, input, candidates);
  }

  /**
   * Resolve the base verdict (the maker pick): the LLM router when coherent, else
   * the keyword scorer, else the terminal fallback (the orchestrator, by default).
   * This is the pre-Phase-11 routing — `mode`/`proposedGoal`/`paths` are overlaid by
   * {@link enrich}. Phase 91: `fallback` lets a scoped caller ({@link classifyWithinSubsystem})
   * swap the terminal target/reason without duplicating the router/scorer flow.
   */
  private async route(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
    fallback: { target: TaskTarget; reason: string } = {
      target: ORCHESTRATOR_TARGET,
      reason: "No agent or pipeline matched confidently — the orchestrator will handle it.",
    },
  ): Promise<TaskRouting> {
    try {
      const routed = await this.router.route(input, candidates);
      if (routed && this.isCoherent(routed, candidates)) return routed;
    } catch (err) {
      this.log.warn("router failed, using keyword fallback", { error: (err as Error).message });
    }

    const scored = this.fallback.score(input, candidates);
    if (scored && scored.confidence >= ORCHESTRATOR_FALLBACK_THRESHOLD) return scored;

    // Terminal rule: nothing matched confidently.
    this.log.info("no confident match, using terminal fallback", {
      confidence: scored?.confidence ?? 0,
      fallbackKind: fallback.target.kind,
    });
    return {
      target: fallback.target,
      // Carry the weak score through so the UI still reads this as a low-confidence
      // verdict (steering the user toward the manual picker on the preview path).
      confidence: scored?.confidence ?? 0,
      reason: fallback.reason,
      matchedTerms: scored?.matchedTerms ?? [],
      candidates: candidates.map(toTaskTarget),
      mode: "single",
      proposedGoal: null,
      paths: [],
    };
  }

  /**
   * Phase 11 overlay (side-effect-free, Decision 1/3): detect the loop shape (the
   * router's `loop` annotation OR a deterministic loop cue), synthesize an in-memory
   * goal proposal when looped AND a concrete maker is resolvable, and resolve each
   * input path against the project registry. NOTHING is persisted — the `.goal.md`
   * is written only on submit. `target` stays the maker; a synthesized loop is never
   * a `target.kind: "goal"` (those require a stored id).
   */
  private async enrich(
    base: TaskRouting,
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
  ): Promise<TaskRouting> {
    const looped = base.mode === "loop" || detectLoopCue(input.text);
    const proposedGoal = looped ? this.synthesizeGoal(base.target, input, candidates) : null;
    const paths = await this.resolvePaths(input.paths ?? []);
    return { ...base, mode: proposedGoal ? "loop" : "single", proposedGoal, paths };
  }

  /**
   * Build an in-memory goal proposal from the routed maker + the raw task text. The
   * verifier defaults to project `checks` (no `commands` → the goal runner resolves
   * the project's checks then `DEFAULT_VERIFY_CHECKS`); objective/instructions are
   * the operator's text verbatim (Law 4 — data, never a command). Returns `null` when
   * no concrete maker can be resolved (an orchestrator pick with no pipeline to
   * iterate), so the caller falls back to `mode: "single"` rather than minting a
   * bogus maker.
   */
  private synthesizeGoal(
    target: TaskTarget,
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
  ): ProposedGoal | null {
    const maker = this.resolveMaker(target, candidates);
    if (!maker) return null;
    return {
      objective: input.text,
      maker,
      verifier: { kind: "checks" },
      maxIterations: DEFAULT_GOAL_ITERATIONS,
      instructions: input.text,
    };
  }

  /**
   * A loop needs a concrete agent/pipeline maker. A routed agent/pipeline target is
   * used directly; an orchestrator pick (no stored id) falls back to a pipeline from
   * the catalog — the maker the delivery loop would iterate — preferring one whose
   * id/name reads as "delivery". No pipeline → `null` (no loop).
   */
  private resolveMaker(target: TaskTarget, candidates: RoutableTarget[]): MakerRef | null {
    if (target.kind === "agent" || target.kind === "pipeline") {
      return { kind: target.kind, id: target.id };
    }
    const pipelines = candidates.filter((c) => c.kind === "pipeline");
    const preferred = pipelines.find((p) => /deliver/i.test(`${p.id} ${p.name}`)) ?? pipelines[0];
    return preferred ? { kind: "pipeline", id: preferred.id } : null;
  }

  /** Resolve each detected path to its containing project (read-only attribution, Law 4). */
  private async resolvePaths(paths: string[]): Promise<ResolvedPath[]> {
    if (paths.length === 0) return [];
    const projects = await this.projects.list().catch(() => []);
    return paths.map((path) => {
      const project = matchProject(projects, { paths: [path] });
      return { path, project: project ? { id: project.id, name: project.name } : null };
    });
  }

  /** Build the rankable candidate catalog from both stores (tolerant of listing failures). */
  private async buildCandidates(): Promise<RoutableTarget[]> {
    // Phase 4c: only ACTIVE agents are dispatchable — a `status: "proposed"`
    // candidate awaiting its `agent-proposal` approval must never be routed to.
    const [agents, pipelines] = await Promise.all([
      this.agents.listActive().catch(() => []),
      this.pipelines.list().catch(() => []),
    ]);

    const agentTargets: RoutableTarget[] = agents.map((a) => ({
      kind: "agent",
      id: a.id,
      name: a.name ?? a.id,
      glyph: a.glyph ?? "bot",
      avatar: a.avatar,
      category: a.category,
      search: [a.name, a.id, a.category, a.description].filter(Boolean).join(" "),
    }));

    return [...agentTargets, ...this.pipelineCandidates(pipelines)];
  }

  /**
   * Project stored pipelines onto the rankable candidate shape — shared by
   * {@link buildCandidates} (the full catalog) and {@link classifyWithinSubsystem}
   * (a pre-filtered, subsystem-owned subset), so the two never compute a pipeline
   * candidate's `search`/`glyph` shape differently.
   */
  private pipelineCandidates(pipelines: readonly Pipeline[]): RoutableTarget[] {
    return pipelines.map((p) => ({
      kind: "pipeline",
      id: p.id,
      name: p.name ?? p.id,
      glyph: "flow",
      avatar: p.avatar,
      // A pipeline's desc carries most of the routable signal; the phase agents add a few terms.
      search: [p.name, p.id, p.desc, ...p.phases.map((ph) => ph.agent)].filter(Boolean).join(" "),
    }));
  }

  /** A verdict is usable only if it parses and names a target that's actually in the catalog. */
  private isCoherent(routing: TaskRouting, candidates: RoutableTarget[]): boolean {
    if (!TaskRoutingSchema.safeParse(routing).success) return false;
    const target = routing.target;
    // The orchestrator is this service's own terminal rule — a router that picks
    // it (instead of a catalog entry) is not a usable verdict. A goal (Phase 10), a
    // chain (Phase 05) and a subsystem (Phase 91) are explicit-only: they never
    // appear in the routable catalog, so the classifier must never route to one
    // (the same posture as orchestrator — this is also the scope-guard belt to the
    // `candidates.some(...)` braces below, which already reject it structurally
    // since neither `buildCandidates` nor `pipelineCandidates` ever emits a
    // `kind: "subsystem"` entry).
    if (
      target.kind === "orchestrator" ||
      target.kind === "goal" ||
      target.kind === "chain" ||
      target.kind === "subsystem"
    ) {
      return false;
    }
    return candidates.some((c) => c.id === target.id && c.kind === target.kind);
  }
}
