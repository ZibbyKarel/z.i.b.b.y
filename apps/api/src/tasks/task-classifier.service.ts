import { Inject, Injectable } from "@nestjs/common";
import {
  type Agent,
  type ClassifyTaskInput,
  type MakerRef,
  ORCHESTRATOR_TARGET,
  PIPELINE_COMPLEXITY_ORDER,
  type Pipeline,
  type ProposedGoal,
  type ResolvedPath,
  SUBSYSTEMS,
  type SubsystemId,
  type TaskRouting,
  TaskRoutingSchema,
  type TaskTarget,
  isExplicitOnlyAgent,
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
 * NS2 F10 — how close the LLM router's top two picks may be before the verdict is
 * treated as a coin flip rather than a decision.
 *
 * Deliberately a MARGIN and not an absolute threshold on `confidence`. The number
 * the router reports is the model's own self-assessment (`claude-cli-router.ts`
 * asks Haiku for its "calibrated 0..1 belief"), and a small model's absolute
 * self-confidence is not calibrated — it collapses onto 0.9/0.95 for almost
 * everything, so an absolute floor either never fires or fires arbitrarily. Both
 * numbers here come out of ONE completion and therefore carry the same bias, so
 * their difference stays informative where neither absolute value is.
 *
 * Tune from observation, not from first principles: land the interactive surface
 * first ({@link TaskRouting.ambiguous} on the classify preview), watch how often
 * real traffic reads as a coin flip, then move this. That ordering is what keeps
 * the autonomous park from becoming a notification firehose.
 */
export const ROUTER_AMBIGUOUS_MARGIN = 0.15;

/**
 * NS2 F10 — the absolute confidence below which a verdict is ambiguous no matter
 * what it says about alternatives. Catches the reply that names no runner-up at all
 * (so there is no margin to compute) while still admitting it doesn't know. Set low
 * on purpose: it is the "the model explicitly gave up" case, not a second general
 * threshold — the margin above is the primary signal.
 */
export const ROUTER_CONFIDENCE_FLOOR = 0.35;

/**
 * NS2 F10 — is this verdict too weak to act on unattended?
 *
 * Pure and exported so it can be truth-tabled without a router, a catalog or a Nest
 * container. Says nothing about what to DO: a caller with a human in the loop (the
 * interactive classify preview) surfaces the doubt and lets the operator pick, while
 * an autonomous caller (the roadmap gate) treats it as the Tier-3 trigger. The
 * verdict's `target` is still the best available pick either way — ambiguity is
 * advice, never an absence of an answer.
 */
export function isAmbiguous(routing: TaskRouting): boolean {
  if (routing.confidence < ROUTER_CONFIDENCE_FLOOR) return true;
  const { runnerUp } = routing;
  if (!runnerUp) return false;
  return routing.confidence - runnerUp.confidence < ROUTER_AMBIGUOUS_MARGIN;
}

/**
 * NS2 F10 — the outcome of {@link TaskClassifierService.route}, which now
 * distinguishes the two ways routing can go wrong instead of collapsing them:
 *
 *  - `"routed"` — a usable verdict. Either the LLM router answered decisively, or
 *    it was UNAVAILABLE (CLI missing, timeout, non-JSON, an id outside the catalog,
 *    no usable confidence) and the deterministic keyword scorer answered instead,
 *    or the terminal fallback rule fired. This is an availability path and it always
 *    produces an answer — a dead subprocess must never become an operator question.
 *  - `"ambiguous"` — the router DID answer and its answer is a coin flip
 *    ({@link isAmbiguous}). That is a judgment call, not an outage, so the keyword
 *    scorer is deliberately not consulted: a term-overlap guess must never overwrite
 *    a model's own "these two are equally plausible".
 *
 * `routing` is populated in both cases, so every existing call site can keep
 * dispatching it unchanged and only callers that care about the distinction read
 * `kind`.
 */
export type RouteResult =
  | { kind: "routed"; routing: TaskRouting }
  | { kind: "ambiguous"; routing: TaskRouting };

/**
 * Phase 11: the iteration fuse a synthesized loop proposes by default. The operator
 * can edit it in the dialog's "Edit" disclosure before submit; it only ever caps a
 * proposal, never an existing goal.
 */
export const DEFAULT_GOAL_ITERATIONS = 6;

/**
 * The complexity-ladder rule appended to every scoped stage-2 router preamble
 * ({@link TaskClassifierService.buildSubsystemPreamble}).
 *
 * Neither the router's system prompt nor the keyword scorer has any notion of
 * how big a change is, so without a stated policy the unit choice rests entirely
 * on an LLM reading a few descriptions. Every subsystem now owns both specialist
 * agents and a graded set of pipelines, so the policy has to name the rungs.
 *
 * NS2 F9 turned this from a binary (agent vs. pipeline) into the four-rung
 * ladder the `complexity` field carries, because "pipeline" stopped being one
 * thing the moment a subsystem owned a `light` and a `deep` one.
 *
 * Kept as prose in the preamble rather than as a new contract field on purpose:
 * the preamble is already the one place per-subsystem routing policy lives, and
 * the ordering it describes IS data (`PIPELINE_COMPLEXITY_ORDER`) — only the
 * wording is prose.
 */
export const EFFORT_RULE =
  "ROUTING RULE: match the unit to the SIZE of the work, and prefer the " +
  "CHEAPEST rung that can do it safely. The rungs, cheapest first: " +
  "(1) a single owned AGENT — a narrow, single-surface change: one file, one " +
  "component, a rename, a copy fix, a small bug, a lookup, a single reply. " +
  "(2) a LIGHT pipeline — still narrow, but it wants a second pair of eyes or a " +
  "deterministic check. " +
  "(3) a STANDARD pipeline — ordinary work needing review and verification. " +
  "(4) a DEEP pipeline — multi-surface work, or work that genuinely needs " +
  "design, review, tests and docs to be safe. " +
  "Each unit below is labelled with its rung. Do not run a deep pipeline for a " +
  "one-line change; do not hand multi-surface work to a lone agent.";

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
  // `forge` was once `"orchestrator"` on the reasoning that its units are
  // delivery SPECIALISTS, so an unsure pick is better self-delegated. That
  // reasoning is wrong for the work forge actually receives: a delivery item on
  // a code project. Escaping to the global orchestrator produces a session with
  // no PR-shaped output, and `RoadmapGateService.reconcileRunning` then kills the
  // item as "Run finished without producing an artifact" — the exact death this
  // fallback was supposed to avoid. `"primary"` makes "unsure" mean "run a
  // pipeline", which is the safe direction.
  //
  // NS2 F9 changed what `"primary"` RESOLVES to, not the policy: it used to read
  // `candidates[0]` (pipelines sorted first, so forge's `delivery` — the most
  // EXPENSIVE unit it owns), and now resolves via `cheapestPipeline` to the
  // lowest pipeline rung. Same safety, a fraction of the cost.
  forge: "primary",
  scout: "primary",
  herald: "primary",
  puls: "primary",
  sentinel: "primary",
  maestro: "primary",
  loom: "primary",
  // Crewed by F9, so these no longer defer: each owns a `light` pipeline.
  codex: "primary",
  hearth: "primary",
  // Own no dispatchable units by design and are therefore never seated in the
  // stage-1 catalog, so stage 2 is unreachable for them and this value is inert.
  // `beacon` IS the Tier-3 surface-and-wait contract rather than a work-doer;
  // `ledger` is a budget/limits service. Kept as `"orchestrator"` so that if
  // either is ever crewed, the safe default applies until it gets a real policy.
  beacon: "orchestrator",
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
 * NS2 F10 splits the two ways that can go wrong, which used to collapse into one
 * path (see {@link RouteResult}). The keyword scorer is now strictly an
 * AVAILABILITY net — it answers when the router is unusable, and that answer always
 * resolves, because an 8s timeout or a missing binary must never wake the operator.
 * A router that DID answer but couldn't separate its top two is a different thing
 * entirely: {@link isAmbiguous} flags it, the scorer is skipped, and each caller
 * decides its own tier — the interactive preview surfaces the doubt, stage 2 keeps
 * guessing (bounded cost), and the autonomous roadmap release parks it for the
 * operator.
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

    // NS2 F10: the interactive path CARRIES ambiguity to the wire rather than acting
    // on it — the classify preview already has a human in front of it and a manual
    // picker beside it, so "I'm torn between these two" is the whole intervention
    // needed. No gate, no park; `enrich`'s spread preserves the flag.
    const base = await this.route(input, candidates);
    return this.enrich(base.routing, input, candidates);
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
    // F9: `first` is now the cheapest AGENT (ladder order), which is the wrong
    // answer for an unsure verdict — see `cheapestPipeline`.
    const primary = this.cheapestPipeline(candidates) ?? first;
    const fallback =
      policy === "orchestrator"
        ? {
            target: ORCHESTRATOR_TARGET,
            reason: `No unit matched confidently — ${displayName} defers to the orchestrator.`,
          }
        : {
            target: toTaskTarget(primary),
            reason: `No unit matched confidently — routed to ${displayName}'s cheapest owned pipeline.`,
          };

    const base = await this.route(input, candidates, {
      fallback,
      preamble: this.buildSubsystemPreamble(subsystem?.mandate ?? "", candidates),
    });
    // NS2 F10 — stage 2 deliberately does NOT ask. The asymmetry is about what a
    // wrong pick costs: at stage 1 it is a whole wrong subsystem, here it is one run
    // of `cheapestPipeline` inside a subsystem the operator (or stage 1) already
    // named. That is a bounded, recoverable cost, and stopping to ask about it would
    // put a decision in front of the operator for every narrow ticket. So the flag is
    // stripped rather than forwarded — a stage-2 verdict never reads as "unresolved"
    // downstream, because it always is resolved.
    return this.enrich({ ...base.routing, ambiguous: false }, input, candidates);
  }

  /**
   * F2b — the router preamble for a scoped stage-2 call: the subsystem's Czech
   * mandate plus a `name — desc` line per owned unit, so the LLM leg reasons
   * about the mandate rather than bare catalog rows. `search` already carries
   * the unit's full routable blob (name + id + desc/category, or the pipeline's
   * phase agents) — reused here rather than re-fetching `desc` separately.
   *
   * {@link EFFORT_RULE} is appended because this preamble is the ONE place a
   * per-subsystem routing policy legitimately lives: nothing else in the
   * pipeline-vs-agent decision has any notion of how BIG a change is, so
   * without it the choice is the LLM's unguided reading of two descriptions.
   */
  private buildSubsystemPreamble(mandate: string, units: readonly RoutableTarget[]): string {
    // F9: each line carries its ladder rung, so EFFORT_RULE's "(1) agent …
    // (4) deep pipeline" wording has something concrete to bind to. An agent has
    // no `complexity` — it IS rung 1, so it is labelled as such rather than left
    // blank, which would read as "unknown" instead of "cheapest".
    const unitLines = units
      .map((u) => {
        const rung = u.kind === "pipeline" ? `${u.complexity} pipeline` : "single agent";
        return `- [${rung}] ${u.name} — ${u.search}`;
      })
      .join("\n");
    return [`SUBSYSTEM MANDATE: ${mandate}`, "OWNED UNITS:", unitLines, EFFORT_RULE].join("\n");
  }

  /**
   * Classify a task to a SUBSYSTEM and nothing else — the switchboard reduced to
   * the one question the North-Star-2 Subsystem Charter says it should ask:
   * "whose domain is this?". The subsystem then picks its own unit
   * ({@link classifyWithinSubsystem}, reached via
   * `TaskSchedulerService.resolveSubsystemTarget`), so a small change can land
   * on a single owned agent instead of a whole delivery pipeline.
   *
   * Used by `RoadmapGateService.release()`. It differs from {@link classify}
   * in three ways that matter:
   *
   *  - **The catalog is subsystem-only.** Concrete agents/pipelines are never
   *    offered, so the verdict can't skip the subsystem layer.
   *  - **Every candidate is SEATED by construction.**
   *    {@link stage1SubsystemCandidates} only emits subsystems owning ≥1
   *    pipeline or active agent, so the returned target can never trip
   *    `SubsystemEmptyRosterError` downstream — the one real hazard of routing
   *    this way (7 of the 11 subsystems own nothing today).
   *  - **No {@link enrich}.** Loop synthesis and tool-grant proposals belong to
   *    the interactive composer; a gate release needs the bare verdict (target +
   *    confidence + reason + matchedTerms) and nothing else.
   *
   * `preferred` names the subsystem to fall back to when nothing matches
   * confidently — the caller's own domain default (the roadmap gate nominates
   * forge: a roadmap item is by construction delivery work). It is honoured only
   * if that subsystem is actually seated; otherwise the first seated candidate
   * wins. Returns `null` only when NO subsystem is seated at all, which the
   * caller must read as "don't direct this task" rather than as a failure.
   */
  async classifySubsystem(
    input: ClassifyTaskInput,
    preferred?: SubsystemId,
  ): Promise<TaskRouting | null> {
    const [pipelines, agents] = await Promise.all([
      this.pipelines.list().catch((): Pipeline[] => []),
      this.agents.listActive().catch((): Agent[] => []),
    ]);
    const candidates = this.stage1SubsystemCandidates(pipelines, agents);
    const fallbackCandidate = candidates.find((c) => c.id === preferred) ?? candidates[0];
    if (!fallbackCandidate) return null;
    // NS2 F10 — ambiguity is EXPOSED here, unlike at stage 2: the caller
    // (`RoadmapGateService`) is autonomous, so nobody sees a preview and a wrong pick
    // costs the whole wrong subsystem. It rides on the verdict's own
    // `TaskRouting.ambiguous` rather than a wider return type, so no signature
    // changes and the flag travels with the data that justifies it (`runnerUp`).
    const result = await this.route(input, candidates, {
      fallback: {
        target: toTaskTarget(fallbackCandidate),
        reason: `No subsystem matched confidently — defaulting to ${fallbackCandidate.name}.`,
      },
    });
    return result.routing;
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
  ): Promise<RouteResult> {
    const fallbackTarget = opts.fallback ?? {
      target: ORCHESTRATOR_TARGET,
      reason: "No agent or pipeline matched confidently — the orchestrator will handle it.",
    };
    try {
      const routed = await this.router.route(input, candidates, opts.preamble);
      if (routed && this.isCoherent(routed, candidates)) {
        // NS2 F10 — the fork that splits an OUTAGE from a JUDGMENT call. Reaching
        // here means the router answered coherently, so the keyword scorer must not
        // run: if the model's own top two are a coin flip, a term-overlap guess is
        // not a tie-breaker, it is a differently-shaped guess that would silently
        // out-rank the model's admitted doubt.
        if (isAmbiguous(routed)) {
          this.log.info("router verdict is a coin flip — reporting ambiguous", {
            target: `${routed.target.kind}:${"id" in routed.target ? routed.target.id : "-"}`,
            confidence: routed.confidence,
            runnerUpConfidence: routed.runnerUp?.confidence ?? null,
          });
          return { kind: "ambiguous", routing: { ...routed, ambiguous: true } };
        }
        return { kind: "routed", routing: routed };
      }
    } catch (err) {
      this.log.warn("router failed, using keyword fallback", { error: (err as Error).message });
    }

    // Availability path: the router was unusable (missing/timed-out CLI, unparseable
    // reply, an id outside the catalog, no usable confidence). The deterministic
    // scorer answers so a dead subprocess never turns into an operator question.
    const scored = this.fallback.score(input, candidates);
    if (scored && scored.confidence >= ORCHESTRATOR_FALLBACK_THRESHOLD) {
      return { kind: "routed", routing: scored };
    }

    // Terminal rule: nothing matched confidently. `warn`, not `info` (NS2 F10) — this
    // is the weakest answer the classifier can give and it is worth seeing in a log
    // scan. No activity record is written HERE on purpose: `TaskSchedulerService`
    // already records `orchestrator-fallback` for a fallback verdict it dispatches,
    // and that telemetry feeds the Agent Factory's recurring-gap scan — a second
    // entry from this layer would double-count every fallback into it.
    this.log.warn("no confident match, using terminal fallback", {
      confidence: scored?.confidence ?? 0,
      fallbackKind: fallbackTarget.target.kind,
    });
    return {
      kind: "routed",
      routing: {
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
        // NS2 F10: a terminal fallback is not "ambiguous" — ambiguity means the
        // router weighed two real options and couldn't separate them. This is the
        // degraded-availability answer, which by contract always resolves rather
        // than asking. Flagging it would park every CLI outage.
        runnerUp: null,
        ambiguous: false,
      },
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
    const proposedGoal = looped ? await this.synthesizeGoal(base.target, input, candidates) : null;
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
  private async synthesizeGoal(
    target: TaskTarget,
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
  ): Promise<ProposedGoal | null> {
    const maker = await this.resolveMaker(target, candidates);
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
   * A loop needs a CONCRETE agent/pipeline maker — a subsystem can't be iterated.
   *
   * A routed agent/pipeline target is used directly (still reachable via an
   * explicit target, and from `classifyWithinSubsystem`'s enriched stage-2
   * verdict). NS2 F9 added the `subsystem` branch: stage 1 now emits nothing but
   * subsystem and orchestrator picks, and the stage-1 catalog holds no pipelines
   * to scan, so a looped task would otherwise have silently lost its goal
   * proposal and degraded to `mode: "single"`. Resolve it the same way stage 2
   * would: the subsystem's cheapest owned pipeline.
   *
   * An orchestrator pick keeps the pre-F9 behaviour — any pipeline from the
   * catalog, preferring one that reads as "delivery" — but since F9's stage-1
   * catalog carries no pipelines, that path now reads the store directly.
   * No pipeline anywhere → `null` (no loop).
   */
  private async resolveMaker(
    target: TaskTarget,
    candidates: RoutableTarget[],
  ): Promise<MakerRef | null> {
    if (target.kind === "agent" || target.kind === "pipeline") {
      return { kind: target.kind, id: target.id };
    }

    // Stage 2 hands over a catalog that already holds the right pipelines (its
    // candidates ARE one subsystem's owned units); stage 1's holds none, so read
    // the store rather than silently degrade to no loop.
    const inCatalog = candidates.filter((c) => c.kind === "pipeline");
    const stored =
      inCatalog.length > 0 ? null : await this.pipelines.list().catch((): Pipeline[] => []);

    if (target.kind === "subsystem") {
      // `pipelineCandidates` sorts cheapest-first, so [0] is the cheapest rung.
      const owned =
        stored === null
          ? inCatalog
          : this.pipelineCandidates(stored.filter((p) => p.ownerSubsystem === target.id));
      const cheapest = owned[0];
      return cheapest ? { kind: "pipeline", id: cheapest.id } : null;
    }

    const pipelines = stored === null ? inCatalog : this.pipelineCandidates(stored);
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

  /**
   * Build the stage-1 candidate catalog — SUBSYSTEMS ONLY (NS2 F9).
   *
   * Before F9 this returned agents + pipelines + subsystems in one flat list and
   * let a single ranking pass choose between them. That asked the router to
   * compare units at two different levels of abstraction: `code-reviewer` (an
   * agent) against `Forge` (the subsystem that owns that very agent). They are
   * not peers — one CONTAINS the other — so whichever won was arbitrary, and the
   * two winners produced materially different runs. A direct agent pick also
   * skipped {@link EFFORT_RULE} entirely, since the size policy only ever
   * reaches the scoped stage-2 preamble; that is how a one-line fix could draw
   * the full five-phase `delivery` pipeline with nothing asking whether the
   * hammer fit.
   *
   * Stage 1 now asks exactly one question — "whose domain is this?" — which is
   * what `classifySubsystem`'s docblock has said the switchboard should ask
   * since the North-Star-2 Subsystem Charter. The unit choice belongs to the
   * subsystem that owns the units ({@link classifyWithinSubsystem}), where the
   * ladder is described and the roster is small enough to rank well.
   *
   * A consequence worth naming: an agent or pipeline with no `ownerSubsystem` is
   * now structurally unroutable — no subsystem lists it, and the classifier can
   * emit nothing else. That is the enforcement behind F9's "no free units", and
   * it is why the create paths 422 without an owner.
   */
  private async buildCandidates(): Promise<RoutableTarget[]> {
    // Phase 4c: only ACTIVE agents are dispatchable — a `status: "proposed"`
    // candidate awaiting its `agent-proposal` approval must never seat a subsystem.
    const [agents, pipelines] = await Promise.all([
      this.agents.listActive().catch((): Agent[] => []),
      this.pipelines.list().catch((): Pipeline[] => []),
    ]);

    return this.stage1SubsystemCandidates(pipelines, agents);
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
   * F2b — the stage-2 catalog for ONE subsystem: its owned ACTIVE agents + its
   * owned pipelines, in LADDER ORDER (cheapest rung first): agents, then
   * `light` → `standard` → `deep` pipelines.
   *
   * NS2 F9 reversed the old ordering. Pipelines used to be listed first purely
   * so {@link SUBSYSTEM_FALLBACK}'s `"primary"` policy could read `candidates[0]`
   * as "the primary owned pipeline". That coupling is gone — the fallback now
   * names its unit explicitly via {@link cheapestPipeline} — which frees the
   * catalog to be ordered the way the router should READ it: cheapest first, so
   * the list itself reinforces {@link EFFORT_RULE}'s "prefer the cheapest rung
   * that can do it safely".
   */
  private subsystemCandidates(
    subsystemId: SubsystemId,
    pipelines: readonly Pipeline[],
    agents: readonly Agent[],
  ): RoutableTarget[] {
    const ownedPipelines = pipelines.filter((p) => p.ownerSubsystem === subsystemId);
    const ownedAgents = agents.filter((a) => a.ownerSubsystem === subsystemId);
    return [...this.agentCandidates(ownedAgents), ...this.pipelineCandidates(ownedPipelines)];
  }

  /**
   * The subsystem's cheapest owned PIPELINE — the `"primary"` fallback unit for
   * a low-confidence stage-2 verdict.
   *
   * Deliberately a pipeline and not simply `candidates[0]` (which is now an
   * agent, since F9 orders the scoped catalog cheapest-first). "Unsure" is
   * exactly the state in which a bare agent is the wrong answer: the reason
   * {@link SUBSYSTEM_FALLBACK} exists at all is that forge tasks escaping to the
   * global orchestrator produced sessions with no PR-shaped output, which
   * `RoadmapGateService.reconcileRunning` then killed as "Run finished without
   * producing an artifact". A pipeline keeps review and verification in the
   * path; picking the CHEAPEST one keeps the old behaviour's safety without its
   * cost (pre-F9 this resolved to forge's `delivery` — the most expensive unit
   * it owns — simply because that was the only pipeline in the list).
   *
   * Falls back to the first candidate of any kind when the subsystem owns no
   * pipeline at all (codex/hearth today own a single light one; a future
   * agents-only subsystem would land here).
   */
  private cheapestPipeline(candidates: readonly RoutableTarget[]): RoutableTarget | undefined {
    return candidates.find((c) => c.kind === "pipeline") ?? candidates[0];
  }

  /**
   * Project stored agents onto the rankable candidate shape — shared by
   * {@link buildCandidates} (the full catalog, ACTIVE agents only) and
   * {@link subsystemCandidates} (a pre-filtered, subsystem-owned subset), so
   * the two never compute an agent candidate's `search`/`glyph` shape
   * differently.
   *
   * {@link isExplicitOnlyAgent} agents are dropped HERE — the one projection
   * both catalogs share, so neither the top-level switchboard nor a scoped
   * subsystem pass can ever route to one. See `EXPLICIT_ONLY_AGENT_IDS`' own
   * docblock for the failure this closes (the roadmap decomposer winning
   * ordinary roadmap tasks on its own footer's wording); the agents themselves
   * stay fully dispatchable via an `explicitTarget`, which is the only way in.
   */
  private agentCandidates(agents: readonly Agent[]): RoutableTarget[] {
    return agents
      .filter((a) => !isExplicitOnlyAgent(a.id))
      .map((a) => ({
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
   * Project stored pipelines onto the rankable candidate shape, sorted onto the
   * complexity ladder (cheapest rung first). Used only by
   * {@link subsystemCandidates} since F9 made stage 1 subsystem-only, but kept as
   * its own projection so a pipeline candidate's `search`/`glyph` shape is
   * computed in exactly one place.
   *
   * `complexity` rides along so {@link buildSubsystemPreamble} can label each
   * unit with its rung and {@link cheapestPipeline} can resolve the fallback
   * without re-reading the stored entities.
   */
  private pipelineCandidates(pipelines: readonly Pipeline[]): RoutableTarget[] {
    return pipelines
      .map((p) => ({
        kind: "pipeline" as const,
        id: p.id,
        name: p.name ?? p.id,
        glyph: "flow",
        avatar: p.avatar,
        complexity: p.complexity,
        // A pipeline's desc carries most of the routable signal; the phase agents add a few terms.
        search: [p.name, p.id, p.desc, ...p.phases.map((ph) => ph.agent)].filter(Boolean).join(" "),
      }))
      .sort(
        (a, b) =>
          PIPELINE_COMPLEXITY_ORDER.indexOf(a.complexity) -
          PIPELINE_COMPLEXITY_ORDER.indexOf(b.complexity),
      );
  }

  /** A verdict is usable only if it parses and names a target that's actually in the catalog. */
  private isCoherent(routing: TaskRouting, candidates: RoutableTarget[]): boolean {
    if (!TaskRoutingSchema.safeParse(routing).success) return false;
    const target = routing.target;
    // The orchestrator is this service's own terminal rule — a router that picks
    // it (instead of a catalog entry) is not a usable verdict. A goal (Phase 10)
    // is explicit-only: it never appears in the routable catalog, so the
    // classifier must never route to one (the same posture as orchestrator —
    // this is also the scope-guard belt to the `candidates.some(...)` check
    // below, which already rejects it structurally since neither
    // `buildCandidates` nor `pipelineCandidates` ever emits a `kind: "goal"`
    // entry). F2a: `subsystem` is REMOVED from this rejection list — the top-level
    // catalog now legitimately offers subsystem candidates (`stage1SubsystemCandidates`),
    // so a seated subsystem verdict is coherent; `classifyWithinSubsystem`'s own
    // catalog never emits one, so this widening can't recurse.
    if (target.kind === "orchestrator" || target.kind === "goal") {
      return false;
    }
    // NS2 F9: an `agent`/`pipeline` verdict is now rejected STRUCTURALLY at stage 1
    // by the check below — `buildCandidates` emits subsystems only, so no concrete
    // unit can match. No explicit rejection is added for them, because the same
    // check is what ACCEPTS them on the scoped stage-2 path, where the catalog is
    // one subsystem's owned units. The catalog decides; the kind never has to.
    return candidates.some((c) => c.id === target.id && c.kind === target.kind);
  }
}
