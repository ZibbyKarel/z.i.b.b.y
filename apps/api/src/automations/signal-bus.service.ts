import { Injectable, type OnModuleInit } from "@nestjs/common";
import { type Automation, SIGNAL_SEVERITY_ORDER, type Signal } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { collisionResistantId } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { AutomationsStorageService } from "./automations.storage.service";
import { SignalBusStore } from "./signal-bus.store";

/**
 * The parked approval's `detail`, packed as the web's enrichment JSON
 * (`apps/web/features/approvals/approval.ts` `parseApprovalDetail`): what fired,
 * what approving will start, and the signal's full body as the preview — so the
 * operator can decide without digging for the source.
 */
function approvalDetail(automation: Automation, signal: Signal): string {
  const t = automation.target;
  const what =
    t.type === "task"
      ? `vznikne úkol${t.target ? ` pro ${t.target.name}` : ""}: „${t.text}“`
      : t.type === "workflow"
        ? `spustí se workflow ${t.workflowId}`
        : t.type === "agent"
          ? `spustí se agent ${t.agentId}`
          : `spustí se ${t.type}`;
  const project = signal.projectId ? ` Projekt: ${signal.projectId}.` : "";
  return JSON.stringify({
    summary: `${automation.name ?? automation.id}: ${signal.title}`,
    consequence: `Po schválení ${what}${project}`,
    preview: { kind: "message", to: signal.from, subject: signal.title, body: signal.body },
  });
}

/** Starts an automation's target for a signal; returns a run reference. */
export type SignalDispatcher = (automation: Automation, signal: Signal) => Promise<string>;

/**
 * The signal bus: a department emits a normalized {@link Signal}; every enabled
 * automation whose `signal` trigger matches it is dispatched (Tier 2) or, with
 * `approval: "ask"`, parked behind an `automation-dispatch` approval (Tier 3).
 * Idempotent per `(automation, signal.fingerprint)`. `emit` NEVER throws — every
 * failure is logged and the signal simply fires nothing (fail-open), so a producer's
 * scan tick always survives.
 *
 * The actual dispatch is the scheduler's (`SchedulerService.dispatch`); it registers
 * itself via {@link registerDispatcher} so this service stays a leaf the producers
 * (Security/Arch/Release/Workflows) can inject without a module cycle.
 */
@Injectable()
export class SignalBusService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;
  private dispatcher: SignalDispatcher | null = null;

  constructor(
    private readonly automations: AutomationsStorageService,
    private readonly store: SignalBusStore,
    private readonly approvals: ApprovalsService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(SignalBusService.name);
  }

  onModuleInit(): void {
    this.approvals.register("automation-dispatch", this);
  }

  registerDispatcher(dispatcher: SignalDispatcher): void {
    this.dispatcher = dispatcher;
  }

  async emit(signal: Signal): Promise<{ runRefs: string[] }> {
    const runRefs: string[] = [];
    try {
      const all = await this.automations.list();
      for (const automation of all) {
        if (!matches(automation, signal)) continue;
        try {
          const ref = await this.fireOne(automation, signal);
          if (ref) runRefs.push(ref);
        } catch (error) {
          this.log.warn("signal: automation dispatch failed — fail-open", {
            automationId: automation.id,
            kind: signal.kind,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.log.warn("signal: emit failed — fail-open, nothing dispatched", {
        kind: signal.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { runRefs };
  }

  /** Dispatch or park one matched automation; `null` when deduped or parked. */
  private async fireOne(automation: Automation, signal: Signal): Promise<string | null> {
    if (await this.store.hasFired(automation.id, signal.fingerprint)) {
      this.log.debug("signal: fingerprint already fired — skipping", {
        automationId: automation.id,
        fingerprint: signal.fingerprint,
      });
      return null;
    }
    if (automation.approval === "ask") {
      const id = collisionResistantId("signal");
      await this.store.createPending({
        id,
        automationId: automation.id,
        signal,
        createdAt: new Date().toISOString(),
      });
      await this.approvals.requestApproval({
        runId: id,
        kind: "automation-dispatch",
        skill: signal.from,
        action: "automation-dispatch",
        detail: approvalDetail(automation, signal),
        risk: "medium",
        department: signal.from,
      });
      await this.store.markFired(automation.id, signal.fingerprint);
      return null;
    }
    const runRef = await this.run(automation, signal);
    await this.store.markFired(automation.id, signal.fingerprint);
    void this.activity.record({
      kind: "automation-dispatched",
      summary: `${automation.name ?? automation.id}: ${signal.title}`,
      refs: {
        runRef,
        automationId: automation.id,
        ...(signal.projectId ? { projectId: signal.projectId } : {}),
      },
    });
    return runRef;
  }

  private async run(automation: Automation, signal: Signal): Promise<string> {
    if (!this.dispatcher) throw new Error("no signal dispatcher registered");
    const runRef = await this.dispatcher(automation, signal);
    await this.automations.markFired(automation.id, new Date().toISOString()).catch(() => {});
    return runRef;
  }

  // ---- ResumableRunner (kind "automation-dispatch") ----------------------------

  /** Approve → dispatch the parked automation with its signal, then drop the record. */
  async resume(pendingId: string): Promise<void> {
    try {
      const pending = await this.store.getPending(pendingId);
      if (!pending) return;
      const automation = await this.automations.get(pending.automationId);
      const runRef = await this.run(automation, pending.signal);
      await this.store.deletePending(pendingId).catch(() => {});
      this.log.info("automation dispatch approved — dispatched", { pendingId, runRef });
    } catch (error) {
      this.log.warn("signal: resume failed — pending dispatch left for a retry", {
        pendingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Reject → drop the parked record, nothing dispatched. */
  cancel(pendingId: string): void {
    void this.store.deletePending(pendingId).catch(() => {});
    this.log.info("automation dispatch rejected — nothing dispatched", { pendingId });
  }
}

/** Does `automation`'s signal trigger match `signal`? (A severity-less signal passes the gate.) */
function matches(automation: Automation, signal: Signal): boolean {
  const t = automation.trigger;
  if (!automation.enabled || t.type !== "signal") return false;
  if (t.kind !== "*" && t.kind !== signal.kind) return false;
  if (t.from && t.from !== signal.from) return false;
  if (t.minSeverity && signal.severity) {
    return (
      SIGNAL_SEVERITY_ORDER.indexOf(signal.severity) >= SIGNAL_SEVERITY_ORDER.indexOf(t.minSeverity)
    );
  }
  return true;
}
