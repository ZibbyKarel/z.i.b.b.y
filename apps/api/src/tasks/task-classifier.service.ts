import { Inject, Injectable } from "@nestjs/common"
import {
  type ClassifyTaskInput,
  ORCHESTRATOR_TARGET,
  type TaskRouting,
  TaskRoutingSchema,
} from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { KeywordScorer } from "./keyword-scorer"
import { type RoutableTarget, TASK_ROUTER, type TaskRouter, toTaskTarget } from "./task-router"

/**
 * Keyword-scorer confidence below which the verdict is not trusted to name a
 * specific agent/pipeline and the task routes to the orchestrator instead. The
 * scorer reports 0.22 for a zero-term match and ≥ 0.55 from the first matched
 * term, so 0.5 separates "guessed the top catalog entry" from "actually matched".
 */
export const ORCHESTRATOR_FALLBACK_THRESHOLD = 0.5

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
  private readonly log: ScopedLogger

  constructor(
    private readonly agents: AgentsStorageService,
    private readonly pipelines: PipelinesStorageService,
    @Inject(TASK_ROUTER) private readonly router: TaskRouter,
    private readonly fallback: KeywordScorer,
    logger: LoggerService,
  ) {
    this.log = logger.child(TaskClassifierService.name)
  }

  async classify(input: ClassifyTaskInput): Promise<TaskRouting | null> {
    const candidates = await this.buildCandidates()
    if (candidates.length === 0) return null

    try {
      const routed = await this.router.route(input, candidates)
      if (routed && this.isCoherent(routed, candidates)) return routed
    } catch (err) {
      this.log.warn("router failed, using keyword fallback", { error: (err as Error).message })
    }

    const scored = this.fallback.score(input, candidates)
    if (scored && scored.confidence >= ORCHESTRATOR_FALLBACK_THRESHOLD) return scored

    // Terminal rule: nothing matched confidently — the orchestrator takes the task.
    this.log.info("no confident match, routing to orchestrator", {
      confidence: scored?.confidence ?? 0,
    })
    return {
      target: ORCHESTRATOR_TARGET,
      // Carry the weak score through so the UI still reads this as a low-confidence
      // verdict (steering the user toward the manual picker on the preview path).
      confidence: scored?.confidence ?? 0,
      reason: "No agent or pipeline matched confidently — the orchestrator will handle it.",
      matchedTerms: scored?.matchedTerms ?? [],
      candidates: candidates.map(toTaskTarget),
    }
  }

  /** Build the rankable candidate catalog from both stores (tolerant of listing failures). */
  private async buildCandidates(): Promise<RoutableTarget[]> {
    const [agents, pipelines] = await Promise.all([
      this.agents.list().catch(() => []),
      this.pipelines.list().catch(() => []),
    ])

    const agentTargets: RoutableTarget[] = agents.map((a) => ({
      kind: "agent",
      id: a.id,
      name: a.name ?? a.id,
      glyph: a.glyph ?? "bot",
      category: a.category,
      search: [a.name, a.id, a.category, a.description].filter(Boolean).join(" "),
    }))

    const pipelineTargets: RoutableTarget[] = pipelines.map((p) => ({
      kind: "pipeline",
      id: p.id,
      name: p.name ?? p.id,
      glyph: "flow",
      // A pipeline's desc carries most of the routable signal; the phase agents add a few terms.
      search: [p.name, p.id, p.desc, ...p.phases.map((ph) => ph.agent)].filter(Boolean).join(" "),
    }))

    return [...agentTargets, ...pipelineTargets]
  }

  /** A verdict is usable only if it parses and names a target that's actually in the catalog. */
  private isCoherent(routing: TaskRouting, candidates: RoutableTarget[]): boolean {
    if (!TaskRoutingSchema.safeParse(routing).success) return false
    const target = routing.target
    // The orchestrator is this service's own terminal rule — a router that picks
    // it (instead of a catalog entry) is not a usable verdict. A goal (Phase 10) is
    // explicit-only: it never appears in the routable catalog, so the classifier
    // must never route to one (the same posture as orchestrator).
    if (target.kind === "orchestrator" || target.kind === "goal") return false
    return candidates.some((c) => c.id === target.id && c.kind === target.kind)
  }
}
