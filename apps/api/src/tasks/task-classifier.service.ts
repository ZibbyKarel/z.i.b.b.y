import { Inject, Injectable } from "@nestjs/common"
import {
  type ClassifyTaskInput,
  type TaskRouting,
  TaskRoutingSchema,
} from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { KeywordScorer } from "./keyword-scorer"
import { type RoutableTarget, TASK_ROUTER, type TaskRouter } from "./task-router"

/**
 * Classifies a free-text task to a stored agent or pipeline. It builds the
 * candidate catalog from the file-backed stores, asks the primary {@link TaskRouter}
 * (the `claude -p` AI categorizer) to pick a target, and falls back to the
 * deterministic {@link KeywordScorer} whenever the router is unavailable, times
 * out, errors, or returns an incoherent verdict. The result is side-effect-free —
 * starting a run is a separate, explicit step (approval-first).
 *
 * Returns `null` only when the catalog is genuinely empty (the controller maps
 * that to 422); every other failure is absorbed into the fallback, so the endpoint
 * never hard-fails.
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
    return this.fallback.score(input, candidates)
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
    return candidates.some(
      (c) => c.id === routing.target.id && c.kind === routing.target.kind,
    )
  }
}
