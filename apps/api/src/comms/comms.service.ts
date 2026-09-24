import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { IntegrationKind, ReplyLedgerEntry, TriageCategory } from "@zibby/contracts";
import { TriageCategorySchema } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { NOTIFY_ONLY_KINDS } from "../channels/notify-only-kinds";
import { collisionResistantId } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { HeraldGraduationStore } from "./herald-graduation.store";
import { ReplyLedgerStore } from "./reply-ledger.store";

/** Parse a non-negative integer env var, falling back to `dflt` on absent/garbage. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

/** Input to {@link HeraldService.recordProposal}. */
export interface RecordProposalInput {
  integrationId: string;
  kind: IntegrationKind;
  projectId?: string;
  itemId: string;
  approvalId?: string;
  category: TriageCategory;
  confidence: number;
  tier: 1 | 2 | 3;
  /** Only the two outcomes a fresh proposal can carry — a decision patches it later. */
  outcome: "pending" | "sent-auto";
}

/**
 * NS2 F6a — the ledger/graduation brain AND the `herald-graduation`
 * {@link ResumableRunner}. Records every drafted reply (Tier-2 auto-send or Tier-3
 * parked draft) to the durable ledger; when a `(integrationId, category)` pair
 * accumulates {@link HERALD_GRADUATION_THRESHOLD} CONSECUTIVE `approved` (unedited)
 * proposals, it parks a Tier-3 `herald-graduation` approval — the operator's
 * explicit sign-off is what widens autonomy, never Herald itself. Email can never
 * reach this path BY CONSTRUCTION: `ChannelTriageFlowService.handleNotifyOnly`
 * returns before any reply branch, so no `channel` approval — and no ledger entry
 * — is ever created for it; {@link maybeProposeGraduation}'s `NOTIFY_ONLY_KINDS`
 * check is defense-in-depth on top of that structural guarantee.
 */
@Injectable()
export class HeraldService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;
  private readonly threshold: number;

  constructor(
    private readonly ledger: ReplyLedgerStore,
    private readonly graduation: HeraldGraduationStore,
    private readonly approvals: ApprovalsService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(HeraldService.name);
    // Read at construction (not module load) so tests can set the env before
    // building the service; production reads it once at boot like every other
    // TickingWatcherBase-adjacent env knob.
    this.threshold = intEnv("HERALD_GRADUATION_THRESHOLD", 10);
  }

  onModuleInit(): void {
    this.approvals.register("herald-graduation", this);
  }

  /** Record a fresh proposal (auto-sent or parked). Returns the new ledger entry id. */
  async recordProposal(input: RecordProposalInput): Promise<string> {
    const id = collisionResistantId("reply");
    const entry: ReplyLedgerEntry = {
      id,
      integrationId: input.integrationId,
      kind: input.kind,
      itemId: input.itemId,
      category: input.category,
      confidence: input.confidence,
      tier: input.tier,
      outcome: input.outcome,
      proposedAt: new Date().toISOString(),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    };
    await this.ledger.record(entry);
    return id;
  }

  /**
   * Patch the matching pending entry's outcome once the operator decides. On
   * `approved`, evaluates whether the pair has now earned a graduation proposal.
   * Fail-open: a missing pending entry (e.g. a resume for an item Herald never
   * saw) logs a warning and no-ops.
   */
  async recordDecision(
    itemId: string,
    integrationId: string,
    category: TriageCategory,
    outcome: "approved" | "rejected",
  ): Promise<void> {
    const candidates = await this.ledger.listFiltered({ integrationId, category });
    const pending = candidates
      .filter((e) => e.itemId === itemId && e.outcome === "pending")
      .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
    const entry = pending[0];
    if (!entry) {
      this.log.warn("recordDecision: no pending ledger entry — no-op", {
        itemId,
        integrationId,
        category,
      });
      return;
    }
    await this.ledger.patchOutcome(entry.id, outcome, new Date().toISOString());
    if (outcome === "approved") {
      await this.maybeProposeGraduation(integrationId, entry.kind, category, entry.projectId).catch(
        (err: unknown) => {
          this.log.warn("maybeProposeGraduation failed (continuing)", {
            error: (err as Error).message,
          });
        },
      );
    }
  }

  /** Passthrough — is `(integrationId, category)` already graduated to Tier-2? */
  isGraduated(integrationId: string, category: TriageCategory): Promise<boolean> {
    return this.graduation.isGraduated(integrationId, category);
  }

  /**
   * Propose a Tier-2 auto-send graduation once the streak clears the threshold.
   * Never proposes for a notify-only kind (email — defense-in-depth, correction
   * #2), an already-graduated pair, or while a graduation for the same pair is
   * already pending (no nagging).
   */
  private async maybeProposeGraduation(
    integrationId: string,
    kind: IntegrationKind,
    category: TriageCategory,
    projectId?: string,
  ): Promise<void> {
    if (NOTIFY_ONLY_KINDS.has(kind)) return;
    if (await this.graduation.isGraduated(integrationId, category)) return;
    const runId = graduationRunId(integrationId, category);
    const pending = await this.approvals.list("pending");
    if (pending.some((a) => a.kind === "herald-graduation" && a.runId === runId)) return;
    const count = await this.ledger.consecutiveApproved(integrationId, category);
    if (count < this.threshold) return;
    await this.approvals.requestApproval({
      runId,
      kind: "herald-graduation",
      skill: "Herald",
      action: "graduate-tier2",
      detail: `${count}/${this.threshold} consecutive replies approved unedited for "${category}" on ${integrationId} — promote to Tier-2 auto-send?`,
      risk: "medium",
    });
    this.log.info("herald graduation proposed", { integrationId, category, count });
    void this.activity.record({
      kind: "channel-approval",
      summary: `Herald navrhuje Tier-2 auto-reply pro ${integrationId}/${category}`,
      refs: { integrationId, status: category, ...(projectId ? { projectId } : {}) },
    });
  }

  // ---- ResumableRunner (kind "herald-graduation") -----------------------------

  /** Approve → write the graduation. Kind is looked up from the ledger (restart-safe). */
  async resume(runId: string): Promise<void> {
    const parsed = parseGraduationRunId(runId);
    if (!parsed) {
      this.log.warn("herald-graduation resume: unparseable runId", { runId });
      return;
    }
    const { integrationId, category } = parsed;
    const entries = await this.ledger.listFiltered({ integrationId, category });
    if (entries.length === 0) {
      this.log.warn("herald-graduation resume: no ledger entries for pair — nothing to graduate", {
        runId,
      });
      return;
    }
    const latest = entries.reduce((a, b) => (b.proposedAt > a.proposedAt ? b : a));
    const evidenceCount = Math.max(
      await this.ledger.consecutiveApproved(integrationId, category),
      1,
    );
    const decidedApprovals = await this.approvals.list();
    const approval = decidedApprovals
      .filter((a) => a.kind === "herald-graduation" && a.runId === runId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    const approvalId = approval?.id ?? collisionResistantId("herald-graduation");
    await this.graduation.add({
      integrationId,
      kind: latest.kind,
      category,
      ...(latest.projectId ? { projectId: latest.projectId } : {}),
      evidenceCount,
      approvalId,
      graduatedAt: new Date().toISOString(),
    });
    this.log.info("herald graduation recorded", { integrationId, category, evidenceCount });
    void this.activity.record({
      kind: "channel-approval",
      summary: `Herald: ${category} replies on ${integrationId} graduated to Tier-2 auto-send`,
      refs: { integrationId, status: category, approvalId },
    });
  }

  /** Reject → leave the channel at Tier-3 (streak stays; a later approval can re-propose). */
  cancel(runId: string): void {
    this.log.info("herald-graduation rejected — pair stays Tier-3", { runId });
  }
}

/** `<integrationId>/<category>` — the herald-graduation approval's runId. */
function graduationRunId(integrationId: string, category: TriageCategory): string {
  return `${integrationId}/${category}`;
}

/** Inverse of {@link graduationRunId}; null on an unparseable/invalid runId. */
function parseGraduationRunId(
  runId: string,
): { integrationId: string; category: TriageCategory } | null {
  const slash = runId.lastIndexOf("/");
  if (slash <= 0) return null;
  const integrationId = runId.slice(0, slash);
  const categoryRaw = runId.slice(slash + 1);
  const parsed = TriageCategorySchema.safeParse(categoryRaw);
  if (!parsed.success) return null;
  return { integrationId, category: parsed.data };
}
