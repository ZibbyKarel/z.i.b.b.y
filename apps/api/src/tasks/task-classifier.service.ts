import { Inject, Injectable } from "@nestjs/common";
import {
  type ClassifyTaskInput,
  type MakerRef,
  ORCHESTRATOR_TARGET,
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
   * Resolve the base verdict (the maker pick): the LLM router when coherent, else
   * the keyword scorer, else the orchestrator terminal rule. This is the pre-Phase-11
   * routing — `mode`/`proposedGoal`/`paths` are overlaid by {@link enrich}.
   */
  private async route(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
  ): Promise<TaskRouting> {
    try {
      const routed = await this.router.route(input, candidates);
      if (routed && this.isCoherent(routed, candidates)) return routed;
    } catch (err) {
      this.log.warn("router failed, using keyword fallback", { error: (err as Error).message });
    }

    const scored = this.fallback.score(input, candidates);
    if (scored && scored.confidence >= ORCHESTRATOR_FALLBACK_THRESHOLD) return scored;

    // Terminal rule: nothing matched confidently — the orchestrator takes the task.
    this.log.info("no confident match, routing to orchestrator", {
      confidence: scored?.confidence ?? 0,
    });
    return {
      target: ORCHESTRATOR_TARGET,
      // Carry the weak score through so the UI still reads this as a low-confidence
      // verdict (steering the user toward the manual picker on the preview path).
      confidence: scored?.confidence ?? 0,
      reason: "No agent or pipeline matched confidently — the orchestrator will handle it.",
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
      category: a.category,
      search: [a.name, a.id, a.category, a.description].filter(Boolean).join(" "),
    }));

    const pipelineTargets: RoutableTarget[] = pipelines.map((p) => ({
      kind: "pipeline",
      id: p.id,
      name: p.name ?? p.id,
      glyph: "flow",
      // A pipeline's desc carries most of the routable signal; the phase agents add a few terms.
      search: [p.name, p.id, p.desc, ...p.phases.map((ph) => ph.agent)].filter(Boolean).join(" "),
    }));

    return [...agentTargets, ...pipelineTargets];
  }

  /** A verdict is usable only if it parses and names a target that's actually in the catalog. */
  private isCoherent(routing: TaskRouting, candidates: RoutableTarget[]): boolean {
    if (!TaskRoutingSchema.safeParse(routing).success) return false;
    const target = routing.target;
    // The orchestrator is this service's own terminal rule — a router that picks
    // it (instead of a catalog entry) is not a usable verdict. A goal (Phase 10) and
    // a chain (Phase 05) are explicit-only: they never appear in the routable catalog,
    // so the classifier must never route to one (the same posture as orchestrator).
    if (
      target.kind === "orchestrator" ||
      target.kind === "goal" ||
      target.kind === "chain"
    ) {
      return false;
    }
    return candidates.some((c) => c.id === target.id && c.kind === target.kind);
  }
}
