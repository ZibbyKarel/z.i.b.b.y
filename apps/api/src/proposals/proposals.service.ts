import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type DecideProposalInput,
  PROPOSAL_TEXT_MAX,
  PROPOSAL_TTL_DAYS,
  type Proposal,
  type ProposalConfidence,
  type ProposalProvenance,
  type ProposalSource,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalAlreadyDecidedError, ApprovalNotFoundError } from "../approvals/approvals.errors";
import { ApprovalsService } from "../approvals/approvals.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ProposalsStore } from "./proposals.store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The reason stamped on an `agent-proposal` approval rejected by a proposal dismissal. */
const DISMISS_REASON = "Dismissed from proposals review";

export class ProposalNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Proposal "${id}" not found`);
    this.name = "ProposalNotFoundError";
  }
}

/** Edit of an agent-factory proposal, or any decision on a dismissed one → 409. */
export class ProposalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalConflictError";
  }
}

/** The edited text is empty after trimming or longer than {@link PROPOSAL_TEXT_MAX}. */
export class InvalidProposalTextError extends Error {
  constructor() {
    super(`Proposal text must be 1–${PROPOSAL_TEXT_MAX} characters`);
    this.name = "InvalidProposalTextError";
  }
}

export interface UpsertProposalInput {
  source: ProposalSource;
  /** The producer's own dedupe key (pattern action+decision, normalized gap, candidate agent id). */
  key: string;
  text: string;
  occurrences: number;
  /** The producer's minimum occurrence count `m` — the confidence scale. */
  minOccurrences: number;
  provenance: ProposalProvenance;
  now?: Date;
}

/** Stable short id: `prop_` + the first 12 hex chars of sha256(source, key). Pure. */
export function proposalId(source: ProposalSource, key: string): string {
  return `prop_${createHash("sha256").update(`${source}\n${key}`).digest("hex").slice(0, 12)}`;
}

/** `low` ≤ m, `medium` ≤ 2m, `high` otherwise. Pure. */
export function confidenceFor(occurrences: number, minOccurrences: number): ProposalConfidence {
  if (occurrences <= minOccurrences) return "low";
  if (occurrences <= 2 * minOccurrences) return "medium";
  return "high";
}

/** The wording a producer writes and the UI shows — the operator's edit wins. Pure. */
export function proposalDisplayText(p: Pick<Proposal, "text" | "editedText">): string {
  return p.editedText ?? p.text;
}

const CONFIDENCE_RANK: Record<ProposalConfidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * System proposals (TODO 14). Producers (`pattern-extract`, `gap-detect`,
 * `agent-factory`) {@link upsert} one record per suggestion; the operator lists,
 * dismisses or edits them; producers read the merged record back (upsert returns
 * it, or {@link decisions}) to skip dismissed lines and write edited wording.
 *
 * Dismissing an `agent-factory` proposal rejects its pending `agent-proposal`
 * approval through {@link ApprovalsService.reject} — the exact path the approvals
 * page takes (`POST /api/approvals/:id/reject`), so the candidate agent is handled
 * by the registered runner's `cancel` the same way.
 */
@Injectable()
export class ProposalsService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: ProposalsStore,
    private readonly activity: ActivityLogService,
    private readonly approvals: ApprovalsService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ProposalsService.name);
  }

  /** Create (open) or refresh a proposal; status, editedText and decidedAt survive a rerun. */
  upsert(input: UpsertProposalInput): Promise<Proposal> {
    const now = input.now ?? new Date();
    const id = proposalId(input.source, input.key);
    const lastSeenAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS).toISOString();
    const fresh = {
      text: input.text.slice(0, PROPOSAL_TEXT_MAX),
      occurrences: input.occurrences,
      confidence: confidenceFor(input.occurrences, input.minOccurrences),
      lastSeenAt,
      expiresAt,
      provenance: input.provenance,
    };
    return this.store.mutate((all) => {
      const existing = all.find((p) => p.id === id);
      const record: Proposal = existing
        ? { ...existing, ...fresh }
        : { id, source: input.source, ...fresh, createdAt: lastSeenAt, status: "open" };
      const next = existing ? all.map((p) => (p.id === id ? record : p)) : [...all, record];
      return { next, result: record };
    });
  }

  /**
   * The note-writing producers' one call: upsert every item, then return the lines
   * to write — dismissed items dropped, edited ones in the operator's wording, the
   * producer's order kept. Fail-open per item: a store failure falls back to the
   * producer's own text, so the vault note (and the briefing) never depend on it.
   */
  async syncNoteLines(
    source: ProposalSource,
    items: ReadonlyArray<{ key: string; text: string; occurrences: number }>,
    base: { minOccurrences: number; provenance: ProposalProvenance; now?: Date },
  ): Promise<string[]> {
    const lines: string[] = [];
    for (const item of items) {
      const record = await this.upsert({ source, ...base, ...item }).catch((err: unknown) => {
        this.log.warn("proposal upsert failed; writing the producer text", {
          source,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
      if (record?.status === "dismissed") continue;
      lines.push(record ? proposalDisplayText(record) : item.text);
    }
    return lines;
  }

  /** Every stored record of `source` (any status, expired included), keyed by id. */
  async decisions(source: ProposalSource): Promise<Map<string, Proposal>> {
    const all = await this.store.readAll();
    return new Map(all.filter((p) => p.source === source).map((p) => [p.id, p]));
  }

  /**
   * Open, unexpired proposals — confidence high first, then `lastSeenAt` newest
   * first. An agent-factory proposal whose approval was already decided on the
   * approvals page (or no longer exists) is hidden: the candidate is resolved.
   */
  async list(now: Date = new Date()): Promise<Proposal[]> {
    const nowIso = now.toISOString();
    const open = (await this.store.readAll()).filter(
      (p) => p.status === "open" && p.expiresAt > nowIso,
    );
    const visible: Proposal[] = [];
    for (const p of open) {
      if (await this.isResolvedAgentProposal(p)) continue;
      visible.push(p);
    }
    return visible.sort(
      (a, b) =>
        CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
  }

  /** Dismiss or edit one proposal; records a `proposal-decided` activity entry. */
  async decide(id: string, input: DecideProposalInput, now: Date = new Date()): Promise<Proposal> {
    const current = (await this.store.readAll()).find((p) => p.id === id);
    if (!current) throw new ProposalNotFoundError(id);
    assertDecidable(current, input);
    const editedText = input.action === "edit" ? validEditText(input.text) : undefined;

    if (input.action === "dismiss" && current.source === "agent-factory") {
      await this.rejectPendingApproval(current.provenance.approvalId);
    }

    const decidedAt = now.toISOString();
    const decided = await this.store.mutate((all) => {
      const latest = all.find((p) => p.id === id);
      if (!latest) throw new ProposalNotFoundError(id);
      assertDecidable(latest, input);
      const record: Proposal =
        input.action === "dismiss"
          ? { ...latest, status: "dismissed", decidedAt }
          : { ...latest, editedText, decidedAt };
      return { next: all.map((p) => (p.id === id ? record : p)), result: record };
    });

    const verb = input.action === "dismiss" ? "dismissed" : "edited";
    void this.activity.record({
      kind: "proposal-decided",
      summary: `${verb} ${decided.source} proposal`,
      refs: {
        itemId: decided.id,
        action: input.action,
        ...(decided.provenance.noteId ? { noteId: decided.provenance.noteId } : {}),
        ...(decided.provenance.agentId ? { agentId: decided.provenance.agentId } : {}),
        ...(decided.provenance.approvalId ? { approvalId: decided.provenance.approvalId } : {}),
        ...(decided.provenance.automationId
          ? { automationId: decided.provenance.automationId }
          : {}),
      },
    });
    this.log.info("proposal decided", { id, action: input.action, source: decided.source });
    return decided;
  }

  /** Reject the candidate's approval when still pending; a decided/missing one is left alone. */
  private async rejectPendingApproval(approvalId: string | undefined): Promise<void> {
    if (!approvalId) return;
    try {
      const approval = await this.approvals.get(approvalId);
      if (approval.status !== "pending") return;
      await this.approvals.reject(approvalId, DISMISS_REASON);
    } catch (err) {
      if (err instanceof ApprovalAlreadyDecidedError || err instanceof ApprovalNotFoundError) {
        return;
      }
      throw err;
    }
  }

  private async isResolvedAgentProposal(p: Proposal): Promise<boolean> {
    if (p.source !== "agent-factory" || !p.provenance.approvalId) return false;
    try {
      const approval = await this.approvals.get(p.provenance.approvalId);
      return approval.status !== "pending";
    } catch (err) {
      // A vanished approval resolves the candidate; any other read failure keeps it visible.
      return err instanceof ApprovalNotFoundError;
    }
  }
}

function assertDecidable(p: Proposal, input: DecideProposalInput): void {
  if (p.status === "dismissed") {
    throw new ProposalConflictError(`Proposal "${p.id}" is already dismissed`);
  }
  if (input.action === "edit" && p.source === "agent-factory") {
    throw new ProposalConflictError(
      `Proposal "${p.id}" is an agent-factory candidate — edit the agent on its page`,
    );
  }
}

function validEditText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > PROPOSAL_TEXT_MAX) {
    throw new InvalidProposalTextError();
  }
  return trimmed;
}
