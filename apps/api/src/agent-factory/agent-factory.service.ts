import { Injectable } from "@nestjs/common";
import type { Agent, Proposal } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ProposalsService, proposalId } from "../proposals/proposals.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { AgentProposalFlowService } from "./agent-proposal-flow.service";
import {
  type FallbackGroup,
  candidateAgentId,
  generateCandidateAgent,
  isCoveredByExistingAgent,
} from "./candidate-generator";

/** Minimum repeats of a normalized fallback summary to qualify as a candidate (gap-detector's threshold). */
const MIN_OCCURRENCES = 3;

/** Days of `orchestrator-fallback` activity scanned per run. */
const WINDOW_DAYS = 30;

/** Max candidates proposed in a single detection pass — bounds a runaway approval queue. */
const MAX_CANDIDATES = 10;

/** Raw task summaries kept per group (folded into the candidate's instructions). */
const MAX_SAMPLES_PER_GROUP = 5;

interface GroupTally {
  samples: string[];
  termCounts: Map<string, number>;
  count: number;
}

export interface AgentFactoryDetectResult {
  /** Ids of the candidate agents actually proposed (parked) this pass. */
  proposed: string[];
}

/**
 * The Agent Factory detector (Phase 4b) — the `GapDetectorService` template
 * applied to the classifier's escape hatch. Scans the past {@link WINDOW_DAYS}
 * of `orchestrator-fallback` activity (Phase 4a), groups entries by their
 * shared normalized summary, and — for a group repeated at least
 * {@link MIN_OCCURRENCES} times — drafts a deterministic candidate agent and
 * parks it behind the `agent-proposal` Tier-3 approval ({@link AgentProposalFlowService}).
 * A group already covered by an existing agent's name/description/category, one
 * whose candidate id already exists, or one with a pending `agent-proposal`
 * approval is skipped (no double-proposing).
 *
 * Deterministic — no LLM call. *Detects ≠ activates*: this only writes a
 * proposed candidate + parks an approval; only an approved decision makes the
 * agent dispatchable (Phase 4c/4d).
 *
 * TODO 14: every parked candidate is also upserted as a structured
 * `agent-factory` proposal (key = candidate id, provenance `{ agentId,
 * approvalId }`); a candidate still pending approval on a later run only
 * refreshes its proposal. Dismissing that proposal rejects the approval
 * (`ProposalsService.decide` → `ApprovalsService.reject`), and a dismissed
 * candidate is never re-proposed on a later run (its proposal is only refreshed).
 */
@Injectable()
export class AgentFactoryService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly activity: ActivityLogService,
    private readonly agents: AgentsStorageService,
    private readonly approvals: ApprovalsService,
    private readonly flow: AgentProposalFlowService,
    logger: LoggerService,
    private readonly proposals: ProposalsService,
  ) {
    this.log = logger.child(AgentFactoryService.name);
  }

  async detect(now: Date = new Date()): Promise<AgentFactoryDetectResult> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const entries = await this.activity.readRange(since, now).catch(() => []);

    const groups = new Map<string, GroupTally>();
    for (const entry of entries) {
      if (entry.kind !== "orchestrator-fallback") continue;
      const key = entry.refs.normalizedSummary;
      if (!key) continue;
      let tally = groups.get(key);
      if (!tally) {
        tally = { samples: [], termCounts: new Map(), count: 0 };
        groups.set(key, tally);
      }
      tally.count += 1;
      if (tally.samples.length < MAX_SAMPLES_PER_GROUP) tally.samples.push(entry.summary);
      for (const term of (entry.refs.terms ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)) {
        tally.termCounts.set(term, (tally.termCounts.get(term) ?? 0) + 1);
      }
    }

    const qualifying = [...groups.entries()]
      .filter(([, tally]) => tally.count >= MIN_OCCURRENCES)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_CANDIDATES);

    // ALL existing agents (proposed or active) — both coverage and the id
    // dup-guard must see a candidate that's already been drafted, not just live ones.
    const existingAgents = await this.agents.list().catch((): Agent[] => []);
    const pendingProposalIds = await this.pendingProposalIds();
    // TODO 14: the operator's decisions — a dismissed candidate is never re-proposed.
    const decisions = await this.proposals
      .decisions("agent-factory")
      .catch((): Map<string, Proposal> => new Map());

    const proposed: string[] = [];
    for (const [normalizedSummary, tally] of qualifying) {
      const group: FallbackGroup = {
        normalizedSummary,
        samples: tally.samples,
        terms: [...tally.termCounts.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term),
        count: tally.count,
      };

      if (isCoveredByExistingAgent(group, existingAgents)) {
        this.log.debug("agent-factory candidate skipped (already covered)", { normalizedSummary });
        continue;
      }
      const id = candidateAgentId(group);
      const decided = decisions.get(proposalId("agent-factory", id));
      if (decided?.status === "dismissed") {
        this.log.debug("agent-factory candidate skipped (proposal dismissed)", { id });
        // Still seen → refresh lastSeenAt, keeping the original approval as provenance.
        await this.upsertProposal(
          generateCandidateAgent(group),
          group.count,
          decided.provenance.approvalId,
          now,
        );
        continue;
      }
      if (existingAgents.some((a) => a.id === id)) {
        this.log.debug("agent-factory candidate skipped (id already exists)", { id });
        continue;
      }
      const pendingApprovalId = pendingProposalIds.get(id);
      if (pendingApprovalId) {
        this.log.debug("agent-factory candidate skipped (pending proposal)", { id });
        // Still seen → refresh the proposal's lastSeenAt/expiry; never re-propose.
        await this.upsertProposal(
          generateCandidateAgent(group),
          group.count,
          pendingApprovalId,
          now,
        );
        continue;
      }

      const candidate = generateCandidateAgent(group);
      const approval = await this.flow.propose(candidate);
      proposed.push(candidate.id);
      if (approval) await this.upsertProposal(candidate, group.count, approval.id, now);
    }

    this.log.info("agent-factory detection complete", {
      scanned: entries.length,
      groups: qualifying.length,
      proposed: proposed.length,
    });
    return { proposed };
  }

  /** Candidate id → its already-pending `agent-proposal` approval id. */
  private async pendingProposalIds(): Promise<Map<string, string>> {
    const pending = await this.approvals.list("pending").catch(() => []);
    return new Map(
      pending.filter((a) => a.kind === "agent-proposal").map((a) => [a.runId, a.id] as const),
    );
  }

  /** Fail-open: a proposals-store failure never breaks the detector run. */
  private async upsertProposal(
    candidate: Agent,
    occurrences: number,
    approvalId: string | undefined,
    now: Date,
  ): Promise<void> {
    const label = candidate.name ? `"${candidate.name}" (${candidate.id})` : candidate.id;
    const text = candidate.description
      ? `New agent ${label} — ${candidate.description}`
      : `New agent ${label}`;
    await this.proposals
      .upsert({
        source: "agent-factory",
        key: candidate.id,
        text,
        occurrences,
        minOccurrences: MIN_OCCURRENCES,
        provenance: { agentId: candidate.id, ...(approvalId ? { approvalId } : {}) },
        now,
      })
      .catch((err: unknown) => {
        this.log.warn("agent-factory proposal upsert failed", {
          id: candidate.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }
}
