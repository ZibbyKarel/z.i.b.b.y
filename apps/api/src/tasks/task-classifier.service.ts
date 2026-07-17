import { Inject, Injectable } from "@nestjs/common";
import {
  type Agent,
  type ClassifyTaskInput,
  type MakerRef,
  ORCHESTRATOR_TARGET,
  type Pipeline,
  type ProposedGoal,
  type ResolvedPath,
  SUBSYSTEMS,
  type SubsystemId,
  type TaskRouting,
  TaskRoutingSchema,
  type TaskTarget,
} from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { matchProject } from "../projects/project-matcher";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { KeywordScorer, detectLoopCue, tokenize } from "./keyword-scorer";
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
 * F2b — each subsystem's terminal fallback when {@link TaskClassifierService.classifyWithinSubsystem}'s
 * stage-2 verdict isn't confident: `"orchestrator"` defers to the global
 * orchestrator (the subsystem's own units are delivery specialists — a
 * low-confidence pick is better self-delegated); `"primary"` dispatches to the
 * subsystem's own first owned unit (registry/file order) instead of escaping
 * the subsystem the operator/switchboard already named. A typed `Record` over
 * the closed `SubsystemId` enum is exhaustiveness discipline — a future
 * subsystem id fails `tsc` here until it's given a policy.
 */
export const SUBSYSTEM_FALLBACK: Record<SubsystemId, "orchestrator" | "primary"> = {
  forge: "orchestrator",
  scout: "primary",
  herald: "primary",
  puls: "primary",
  sentinel: "primary",
  maestro: "primary",
  beacon: "primary",
  loom: "primary",
  codex: "orchestrator",
  ledger: "orchestrator",
};

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
   * Phase 91 / F2b — classify a task within ONE subsystem's owned roster: the
   * design doc's "recursive scoped routing", the same {@link route}/{@link isCoherent}
   * machinery reused with a candidate catalog restricted to the subsystem's OWN
   * pipelines + active agents (never the full catalog, never another subsystem).
   * Called only for the 2+-owned-units case; the caller
   * (`TaskSchedulerService.resolveSubsystemTargetOrNull`) resolves 0/1 owned
   * units itself without a classify round-trip.
   *
   * The router prompt is steered by a composed `preamble` (the subsystem's
   * mandate + an "owned units" list) so the LLM leg reasons about the mandate,
   * not just bare catalog rows. The terminal fallback for "nothing matched
   * confidently" is {@link SUBSYSTEM_FALLBACK}'s per-subsystem policy — never a
   * blanket rule, because a subsystem whose own units are delivery specialists
   * (forge) is better served escaping to the orchestrator than forcing a guess,
   * while most subsystems are better served staying inside their own mandate.
   *
   * Returns `null` only when the subsystem owns zero live pipelines/agents
   * (defensive — the caller never invokes this with an empty roster).
   */
  async classifyWithinSubsystem(
    input: ClassifyTaskInput,
    subsystemId: SubsystemId,
  ): Promise<TaskRouting | null> {
    const [allPipelines, allAgents] = await Promise.all([
      this.pipelines.list().catch((): Pipeline[] => []),
      this.agents.listActive().catch((): Agent[] => []),
    ]);
    const candidates = this.subsystemCandidates(subsystemId, allPipelines, allAgents);
    const first = candidates[0];
    if (!first) return null;

    const subsystem = SUBSYSTEMS.find((s) => s.id === subsystemId);
    const displayName = subsystem?.name ?? subsystemId;
    const policy = SUBSYSTEM_FALLBACK[subsystemId];
    const fallback =
      policy === "orchestrator"
        ? {
            target: ORCHESTRATOR_TARGET,
            reason: `No unit matched confidently — ${displayName} defers to the orchestrator.`,
          }
        : {
            target: toTaskTarget(first),
            reason: `No unit matched confidently — routed to ${displayName}'s primary owned unit.`,
          };

    const base = await this.route(input, candidates, {
      fallback,
      preamble: this.buildSubsystemPreamble(subsystem?.mandate ?? "", candidates),
    });
    return this.enrich(base, input, candidates);
  }

  /**
   * F2b — the router preamble for a scoped stage-2 call: the subsystem's Czech
   * mandate plus a `name — desc` line per owned unit, so the LLM leg reasons
   * about the mandate rather than bare catalog rows. `search` already carries
   * the unit's full routable blob (name + id + desc/category, or the pipeline's
   * phase agents) — reused here rather than re-fetching `desc` separately.
   */
  private buildSubsystemPreamble(mandate: string, units: readonly RoutableTarget[]): string {
    const unitLines = units.map((u) => `- ${u.name} — ${u.search}`).join("\n");
    return [`SUBSYSTEM MANDATE: ${mandate}`, "OWNED UNITS:", unitLines].join("\n");
  }

  /**
   * Resolve the base verdict (the maker pick): the LLM router when coherent, else
   * the keyword scorer, else the terminal fallback (the orchestrator, by default).
   * This is the pre-Phase-11 routing — `mode`/`proposedGoal`/`paths` are overlaid by
   * {@link enrich}. Phase 91: `opts.fallback` lets a scoped caller
   * ({@link classifyWithinSubsystem}) swap the terminal target/reason without
   * duplicating the router/scorer flow. F2b: `opts.preamble` is threaded into the
   * LLM router only (the keyword scorer has no prompt to inject it into).
   */
  private async route(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
    opts: {
      fallback?: { target: TaskTarget; reason: string };
      preamble?: string;
    } = {},
  ): Promise<TaskRouting> {
    const fallbackTarget = opts.fallback ?? {
      target: ORCHESTRATOR_TARGET,
      reason: "No agent or pipeline matched confidently — the orchestrator will handle it.",
    };
    try {
      const routed = await this.router.route(input, candidates, opts.preamble);
      if (routed && this.isCoherent(routed, candidates)) return routed;
    } catch (err) {
      this.log.warn("router failed, using keyword fallback", { error: (err as Error).message });
    }

    const scored = this.fallback.score(input, candidates);
    if (scored && scored.confidence >= ORCHESTRATOR_FALLBACK_THRESHOLD) return scored;

    // Terminal rule: nothing matched confidently.
    this.log.info("no confident match, using terminal fallback", {
      confidence: scored?.confidence ?? 0,
      fallbackKind: fallbackTarget.target.kind,
    });
    return {
      target: fallbackTarget.target,
      // Carry the weak score through so the UI still reads this as a low-confidence
      // verdict (steering the user toward the manual picker on the preview path).
      confidence: scored?.confidence ?? 0,
      reason: fallbackTarget.reason,
      matchedTerms: scored?.matchedTerms ?? [],
      candidates: candidates.map(toTaskTarget),
      mode: "single",
      proposedGoal: null,
      paths: [],
      // Phase 108: no grant proposal at the terminal-fallback rule — enrich() overlays it.
      toolGrants: [],
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
    const toolGrants = await this.proposeToolGrants(base.target, input.text);
    return { ...base, mode: proposedGoal ? "loop" : "single", proposedGoal, paths, toolGrants };
  }

  /**
   * Phase 108 (Decision 6, binding decision 5's sibling): the classifier's
   * ADVISORY proposal of which of the routed target's `optionalTools` look
   * relevant to this task — never invents an id outside that ceiling; the
   * operator's separately-confirmed `CreateTaskInput.toolGrants` is what
   * actually rides into dispatch (re-intersected there, never trusted from
   * this proposal alone).
   *
   * Approach (b) — a deterministic keyword heuristic, not a second `claude -p`
   * round-trip: keeps this phase self-contained (no extra router-prompt field,
   * no extra latency/cost per classify call) while still being useful — most
   * `optionalTools` ids read as `snake_case` words (`recall_memory`,
   * `list_entities`) that plausibly appear in a task description verbatim.
   * Only an agent target is considered; a pipeline/goal/orchestrator pick (no
   * agent definition to read `optionalTools` off) always proposes `[]`.
   */
  private async proposeToolGrants(target: TaskTarget, text: string): Promise<string[]> {
    if (target.kind !== "agent") return [];
    const agent = await this.agents.get(target.id).catch(() => null);
    const optionalTools = agent?.optionalTools ?? [];
    if (optionalTools.length === 0) return [];
    const haystack = new Set(tokenize(text));
    return optionalTools.filter((id) => {
      const words = id
        .split(/[^a-zA-Z0-9]+/)
        .map((w) => w.toLowerCase())
        .filter((w) => w.length >= 3);
      return words.some((w) => haystack.has(w));
    });
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
      this.agents.listActive().catch((): Agent[] => []),
      this.pipelines.list().catch((): Pipeline[] => []),
    ]);

    return [
      ...this.agentCandidates(agents),
      ...this.pipelineCandidates(pipelines),
      ...this.stage1SubsystemCandidates(pipelines, agents),
    ];
  }

  /**
   * F2a/F2b — one stage-1 candidate per subsystem that owns ≥1 pipeline OR ≥1
   * active agent (computed from the listed pipelines'/agents' `ownerSubsystem`),
   * so the top-level switchboard can emit a whole-delegation verdict alongside
   * its agent/pipeline picks. Subsystems owning nothing yet (codex/ledger,
   * until F4/F5) are excluded — offering them invites a verdict that
   * immediately unwinds at stage-2's empty-roster check (wasted tokens, a
   * misleading trace). `search` is the subsystem's Czech mandate, so the
   * keyword scorer ranks it on mandate-term overlap for free. Never offered by
   * {@link classifyWithinSubsystem} — a subsystem never delegates to another
   * subsystem.
   */
  private stage1SubsystemCandidates(
    pipelines: readonly Pipeline[],
    agents: readonly Agent[],
  ): RoutableTarget[] {
    const owning = new Set([
      ...pipelines.map((p) => p.ownerSubsystem).filter(Boolean),
      ...agents.map((a) => a.ownerSubsystem).filter(Boolean),
    ]);
    return SUBSYSTEMS.filter((s) => owning.has(s.id)).map((s) => ({
      kind: "subsystem",
      id: s.id,
      name: s.name,
      // "orbit" (the design's first choice) isn't a DS IconName — "grid" is the
      // web's own KIND_FALLBACK_GLYPH default for a subsystem target
      // (`apps/web/features/tasks/task.ts`), reused here instead of inventing one.
      glyph: "grid",
      search: s.mandate,
    }));
  }

  /**
   * F2b — the stage-2 catalog for ONE subsystem: its own owned pipelines +
   * owned ACTIVE agents, built from the exact same projections
   * ({@link pipelineCandidates}/{@link agentCandidates}) {@link buildCandidates}
   * uses, so a unit's `search`/`glyph` never drifts between the top-level and
   * scoped catalogs. Pipelines are listed first — {@link SUBSYSTEM_FALLBACK}'s
   * `"primary"` policy reads `candidates[0]` as "the subsystem's primary owned
   * pipeline" (registry/file order), falling back to its first owned agent only
   * when it owns no pipeline at all.
   */
  private subsystemCandidates(
    subsystemId: SubsystemId,
    pipelines: readonly Pipeline[],
    agents: readonly Agent[],
  ): RoutableTarget[] {
    const ownedPipelines = pipelines.filter((p) => p.ownerSubsystem === subsystemId);
    const ownedAgents = agents.filter((a) => a.ownerSubsystem === subsystemId);
    return [...this.pipelineCandidates(ownedPipelines), ...this.agentCandidates(ownedAgents)];
  }

  /**
   * Project stored agents onto the rankable candidate shape — shared by
   * {@link buildCandidates} (the full catalog, ACTIVE agents only) and
   * {@link subsystemCandidates} (a pre-filtered, subsystem-owned subset), so
   * the two never compute an agent candidate's `search`/`glyph` shape
   * differently.
   */
  private agentCandidates(agents: readonly Agent[]): RoutableTarget[] {
    return agents.map((a) => ({
      kind: "agent",
      id: a.id,
      name: a.name ?? a.id,
      glyph: a.glyph ?? "bot",
      avatar: a.avatar,
      category: a.category,
      search: [a.name, a.id, a.category, a.description].filter(Boolean).join(" "),
    }));
  }

  /**
   * Project stored pipelines onto the rankable candidate shape — shared by
   * {@link buildCandidates} (the full catalog) and {@link subsystemCandidates}
   * (a pre-filtered, subsystem-owned subset), so the two never compute a
   * pipeline candidate's `search`/`glyph` shape differently.
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
    // it (instead of a catalog entry) is not a usable verdict. A goal (Phase 10)
    // and a chain (Phase 05) are explicit-only: they never appear in the routable
    // catalog, so the classifier must never route to one (the same posture as
    // orchestrator — this is also the scope-guard belt to the `candidates.some(...)`
    // check below, which already rejects them structurally since neither
    // `buildCandidates` nor `pipelineCandidates` ever emits a `kind: "goal"`/`"chain"`
    // entry). F2a: `subsystem` is REMOVED from this rejection list — the top-level
    // catalog now legitimately offers subsystem candidates (`stage1SubsystemCandidates`),
    // so a seated subsystem verdict is coherent; `classifyWithinSubsystem`'s own
    // catalog never emits one, so this widening can't recurse.
    if (target.kind === "orchestrator" || target.kind === "goal" || target.kind === "chain") {
      return false;
    }
    return candidates.some((c) => c.id === target.id && c.kind === target.kind);
  }
}
