import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  type CreateTaskInput,
  HANDOFF_SEVERITY_ORDER,
  type HandoffOutcome,
  type HandoffProposal,
  type HandoffRule,
  type HandoffSignal,
  type HandoffTarget,
  SUBSYSTEMS,
  type TaskTarget,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { collisionResistantId } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { HandoffFiredStore } from "./handoff-fired.store";
import { HandoffProposalStore } from "./handoff-proposal.store";
import { HandoffRuleStore } from "./handoff-rule.store";

/**
 * A2 — the handoff evaluation engine (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A.2):
 * matches a producer's normalized {@link HandoffSignal} against the standing
 * {@link HandoffRule} set and either dispatches silently (Tier 1), dispatches
 * and reports (Tier 2), or parks a {@link HandoffProposal} behind a
 * `handoff-proposal` approval (Tier 3) — never a fourth path. `evaluate` is
 * called synchronously inside a producer's scan/audit/watch tick (A3), so it
 * NEVER throws — every failure is logged and resolves to `{ action: "none" }`,
 * exactly the "a secret finding has no matching rule" no-dispatch case.
 */
@Injectable()
export class HandoffService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;

  constructor(
    private readonly rules: HandoffRuleStore,
    private readonly proposals: HandoffProposalStore,
    private readonly fired: HandoffFiredStore,
    private readonly taskScheduler: TaskSchedulerService,
    private readonly approvals: ApprovalsService,
    private readonly activity: ActivityLogService,
    private readonly pipelines: PipelinesStorageService,
    logger: LoggerService,
  ) {
    this.log = logger.child(HandoffService.name);
  }

  onModuleInit(): void {
    this.approvals.register("handoff-proposal", this);
  }

  /** Evaluate one signal against the rule set. Fail-open — never throws. */
  async evaluate(signal: HandoffSignal): Promise<HandoffOutcome> {
    try {
      const rule = await this.matchRule(signal);
      if (!rule) return { action: "none" };
      if (await this.fired.hasFired(rule.id, signal.fingerprint)) {
        this.log.debug("handoff: fingerprint already fired — skipping", {
          ruleId: rule.id,
          fingerprint: signal.fingerprint,
        });
        return { action: "none" };
      }
      return rule.tier === 3 ? await this.propose(rule, signal) : await this.dispatch(rule, signal);
    } catch (error) {
      this.log.warn("handoff: evaluate failed — fail-open, no dispatch", {
        from: signal.from,
        kind: signal.kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return { action: "none" };
    }
  }

  /** First enabled rule matching `from` + `signalKind` (exact or `"*"`) + severity gate. */
  private async matchRule(signal: HandoffSignal): Promise<HandoffRule | null> {
    const rules = await this.rules.list();
    const matches = rules.filter(
      (rule) =>
        rule.enabled &&
        rule.from === signal.from &&
        (rule.signalKind === "*" || rule.signalKind === signal.kind) &&
        severityGatePasses(rule, signal),
    );
    if (matches.length > 1) {
      this.log.debug("handoff: multiple rules matched signal — first wins", {
        from: signal.from,
        kind: signal.kind,
        ruleIds: matches.map((r) => r.id),
      });
    }
    return matches[0] ?? null;
  }

  /** Tier 1 (silent) / Tier 2 (silent + activity) dispatch. */
  private async dispatch(rule: HandoffRule, signal: HandoffSignal): Promise<HandoffOutcome> {
    const target = await this.decorateTarget(rule.to);
    const runRef = await this.dispatchTask(signal, target);
    await this.fired.markFired(rule.id, signal.fingerprint);
    if (rule.tier === 2) {
      void this.activity.record({
        kind: "handoff",
        summary: `${subsystemLabel(signal.from)} → ${targetLabel(rule.to)}: ${signal.title}`,
        refs: {
          runRef,
          ...(signal.projectId ? { projectId: signal.projectId } : {}),
          ...(rule.to.kind === "subsystem" ? { ownerSubsystem: rule.to.id } : {}),
        },
      });
    } else {
      this.log.debug("handoff: tier-1 silent dispatch", { ruleId: rule.id, runRef });
    }
    return { action: "dispatched", runRef, target: rule.to };
  }

  /** Tier 3: park a proposal behind a `handoff-proposal` approval instead of dispatching. */
  private async propose(rule: HandoffRule, signal: HandoffSignal): Promise<HandoffOutcome> {
    const proposal: HandoffProposal = {
      id: collisionResistantId("handoff"),
      ruleId: rule.id,
      signal,
      target: rule.to,
      createdAt: new Date().toISOString(),
    };
    await this.proposals.create(proposal);
    const approval = await this.approvals.requestApproval({
      runId: proposal.id,
      kind: "handoff-proposal",
      skill: signal.from,
      action: "handoff",
      detail: `${subsystemLabel(signal.from)} → ${targetLabel(rule.to)}: ${signal.title}`,
      risk: "medium",
      ownerSubsystem: signal.from,
    });
    await this.fired.markFired(rule.id, signal.fingerprint);
    return { action: "proposed", approvalId: approval.id };
  }

  /**
   * Build the task input from a signal and dispatch it, returning a ref for the
   * outcome/activity entry. `createTask`'s synchronous path (no `scheduledAt`, no
   * `background`) usually returns `{ outcome: "dispatched", runRef }`; a budget/
   * concurrency-held or queued task instead returns `{ outcome: "scheduled" |
   * "pending", task }` — handoff still counts that as "handed off" (the scheduler
   * owns it from here), so the persisted task's id is used as the ref (mirrors
   * `post-merge-watch.service.ts`'s `"task" in result ? result.task.id : undefined`).
   */
  private async dispatchTask(signal: HandoffSignal, target: TaskTarget): Promise<string> {
    const input: CreateTaskInput = { title: signal.title, text: signal.body, paths: [] };
    const result = await this.taskScheduler.createTask(input, Date.now(), signal.projectId, target);
    return result.outcome === "dispatched" ? result.runRef : result.task.id;
  }

  /**
   * Decorate a stored {@link HandoffTarget} (routing identity only) into a full
   * {@link TaskTarget} `createTask` needs (routing identity + display `name`):
   *  - `subsystem` — looked up in the `SUBSYSTEMS` registry; falls back to the raw
   *    id if somehow absent (defensive only — `SubsystemIdSchema` already closes
   *    the id space).
   *  - `pipeline` — looked up in the live pipelines store; falls back to the raw
   *    id if the pipeline was deleted/renamed since the rule was written
   *    (fail-open — a display-name miss should never block a dispatch).
   */
  private async decorateTarget(target: HandoffTarget): Promise<TaskTarget> {
    if (target.kind === "subsystem") {
      const name = SUBSYSTEMS.find((s) => s.id === target.id)?.name ?? target.id;
      return { kind: "subsystem", id: target.id, name };
    }
    const pipeline = await this.pipelines.get(target.id).catch(() => null);
    return { kind: "pipeline", id: target.id, name: pipeline?.name ?? target.id };
  }

  // ---- ResumableRunner (kind "handoff-proposal") ------------------------------

  /** Approve → dispatch the parked payload's task, then drop the proposal. */
  async resume(proposalId: string): Promise<void> {
    try {
      const proposal = await this.proposals.get(proposalId);
      const target = await this.decorateTarget(proposal.target);
      const runRef = await this.dispatchTask(proposal.signal, target);
      await this.proposals.delete(proposalId).catch(() => {});
      this.log.info("handoff proposal approved — dispatched", { proposalId, runRef });
    } catch (error) {
      this.log.warn("handoff: resume failed — proposal left for a retry", {
        proposalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Reject → drop the proposal, no task dispatched. */
  cancel(proposalId: string): void {
    void this.proposals.delete(proposalId).catch(() => {});
    this.log.info("handoff proposal rejected — no task dispatched", { proposalId });
  }
}

/** A rule's `minSeverity` only gates signals that themselves carry a severity. */
function severityGatePasses(rule: HandoffRule, signal: HandoffSignal): boolean {
  if (!signal.severity || !rule.minSeverity) return true;
  return (
    HANDOFF_SEVERITY_ORDER.indexOf(signal.severity) >=
    HANDOFF_SEVERITY_ORDER.indexOf(rule.minSeverity)
  );
}

function subsystemLabel(id: string): string {
  return SUBSYSTEMS.find((s) => s.id === id)?.name ?? id;
}

function targetLabel(target: HandoffTarget): string {
  return target.kind === "subsystem" ? subsystemLabel(target.id) : target.id;
}
