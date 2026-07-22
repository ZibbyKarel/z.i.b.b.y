import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
import { HANDOFF_FIRED_DIR, HandoffFiredStore } from "./handoff-fired.store";
import { HANDOFF_PROPOSALS_DIR, HandoffProposalStore } from "./handoff-proposal.store";
import { HANDOFF_RULES_FILE, HandoffRuleStore } from "./handoff-rule.store";
import { HANDOFF_SIGNAL_KINDS_FILE, HandoffSignalKindStore } from "./handoff-signal-kind.store";
import { HandoffController } from "./handoff.controller";
import { HandoffService } from "./handoff.service";
import { SignalKindService } from "./signal-kind.service";

/** Default rules file, anchored to `apps/api/data/handoff/rules.json`. */
export function resolveHandoffRulesFile(): string {
  return process.env.HANDOFF_RULES_FILE ?? dataDir("handoff", "rules.json");
}

/** Default signal-kinds file, anchored to `apps/api/data/handoff/signal-kinds.json`. */
export function resolveHandoffSignalKindsFile(): string {
  return process.env.HANDOFF_SIGNAL_KINDS_FILE ?? dataDir("handoff", "signal-kinds.json");
}

/** Default proposals dir, anchored to `apps/api/data/handoff/proposals`. */
export function resolveHandoffProposalsDir(): string {
  return process.env.HANDOFF_PROPOSALS_DIR ?? dataDir("handoff", "proposals");
}

/** Default fired-fingerprints dir, anchored to `apps/api/data/handoff/fired`. */
export function resolveHandoffFiredDir(): string {
  return process.env.HANDOFF_FIRED_DIR ?? dataDir("handoff", "fired");
}

/**
 * A2 — the handoff evaluation engine (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A.2): the
 * standing rule store + idempotency snapshot + Tier-3 proposal store, wired to
 * dispatch through the existing task scheduler and gate through the existing
 * approvals queue. Imports `TasksModule` (for `TaskSchedulerService`) and
 * `PipelinesModule` (to resolve a pipeline-kind rule target's display `name`
 * before dispatch) directly — `TasksModule` itself imports `PipelinesModule` but
 * does not re-export it, so this module needs its own edge; neither imports back
 * (or imports `HandoffModule`), so there is no cycle. Producers (Sentinel/
 * Maestro/Loom/pipeline artifacts) wire in at A3 — nothing here imports them.
 *
 * B1 (design doc
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`)
 * adds the signal-kind registry (`HandoffSignalKindStore`) and its
 * `SignalKindService`, which spawns a Forge build task on `create` via the SAME
 * already-imported `TasksModule`/`TaskSchedulerService` — no new module edge, no
 * DI cycle. `SignalKindService` is exported alongside `HandoffService` for B4
 * (auto-activation) to consume later.
 */
@Module({
  imports: [ApprovalsModule, TasksModule, PipelinesModule],
  controllers: [HandoffController],
  providers: [
    { provide: HANDOFF_RULES_FILE, useFactory: resolveHandoffRulesFile },
    { provide: HANDOFF_PROPOSALS_DIR, useFactory: resolveHandoffProposalsDir },
    { provide: HANDOFF_FIRED_DIR, useFactory: resolveHandoffFiredDir },
    { provide: HANDOFF_SIGNAL_KINDS_FILE, useFactory: resolveHandoffSignalKindsFile },
    HandoffRuleStore,
    HandoffProposalStore,
    HandoffFiredStore,
    HandoffSignalKindStore,
    HandoffService,
    SignalKindService,
  ],
  exports: [HandoffService, SignalKindService],
})
export class HandoffModule {}
