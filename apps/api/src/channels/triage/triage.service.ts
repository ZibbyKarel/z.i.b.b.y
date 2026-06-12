import { Inject, Injectable } from "@nestjs/common"
import type { TriageVerdict } from "@zibby/contracts"
import { LoggerService, type ScopedLogger } from "../../shared/logging/logger.service"
import { KeywordTriager } from "./keyword-triager"
import { TRIAGE_ROUTER, type TriageRouter } from "./triage-router"

/**
 * Confidence floor (the classifier's 0.5 constant): a Claude verdict below this is
 * not trusted to LOWER the tier, so it is escalated one tier (act-then-report
 * becomes surface-and-wait), never the reverse. The dual of the classifier's
 * orchestrator-fallback threshold.
 */
export const TRIAGE_CONFIDENCE_FLOOR = 0.5

/**
 * Triage orchestration — mirrors the task classifier exactly. Asks the primary
 * {@link TriageRouter} (the `claude -p` triager), validates + confidence-floor
 * escalates its verdict, and falls back to the deterministic {@link KeywordTriager}
 * whenever the router is unavailable, errors, or returns an incoherent verdict. A
 * verdict is ALWAYS produced (the fallback never returns null) — triage never
 * no-ops, and a low-confidence result lands at the higher, safer tier.
 */
@Injectable()
export class TriageService {
  private readonly log: ScopedLogger

  constructor(
    @Inject(TRIAGE_ROUTER) private readonly router: TriageRouter,
    private readonly fallback: KeywordTriager,
    logger: LoggerService,
  ) {
    this.log = logger.child(TriageService.name)
  }

  async triage(text: string, mandateSummary?: string): Promise<TriageVerdict> {
    try {
      const verdict = await this.router.triage({ text, mandate: mandateSummary })
      if (verdict) return this.applyConfidenceFloor(verdict)
    } catch (err) {
      this.log.warn("triage router failed, using keyword fallback", { error: (err as Error).message })
    }
    return this.fallback.score(text)
  }

  /** A low-confidence verdict is escalated one tier (never lowered). */
  private applyConfidenceFloor(verdict: TriageVerdict): TriageVerdict {
    if (verdict.confidence < TRIAGE_CONFIDENCE_FLOOR && verdict.tier < 3) {
      const tier = (verdict.tier + 1) as 1 | 2 | 3
      this.log.info("triage verdict escalated on low confidence", {
        from: verdict.tier,
        to: tier,
        confidence: verdict.confidence,
      })
      return { ...verdict, tier, reason: `${verdict.reason} (escalated: low confidence)` }
    }
    return verdict
  }
}
