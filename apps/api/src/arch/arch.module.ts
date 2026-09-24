import { Module } from "@nestjs/common";
import { HandoffModule } from "../handoff/handoff.module";
import { resolveGraphReportPath } from "../self-knowledge/self-knowledge.module";
import { GRAPH_REPORT_PATH } from "../self-knowledge/self-knowledge.service";
import { MemoryModule } from "../memory/memory.module";
import { SubsystemFindingsModule } from "../subsystems/subsystem-findings.module";
import { LoomService } from "./loom.service";

/**
 * NS2 F5c — Loom's nightly quality audit. A leaf module (like `SentinelModule`):
 * imported by `AutomationsModule` (the scheduler target) and `BriefingModule`
 * (the findings extras array) but imports neither back — no cycle risk, same
 * position as `sentinel`. Reuses `SelfKnowledgeModule`'s `GRAPH_REPORT_PATH`
 * token + `resolveGraphReportPath()` factory (same file, same cwd-independent
 * resolution) rather than duplicating it — the token is just a string, so
 * providing it again here is independent DI scoping, not a shared instance.
 *
 * A3: also imports `HandoffModule` — every new finding now emits a
 * `HandoffSignal` through `HandoffService` (the wildcard tier-3 seed rule
 * parks a proposal, never dispatches).
 */
@Module({
  imports: [MemoryModule, SubsystemFindingsModule, HandoffModule],
  providers: [{ provide: GRAPH_REPORT_PATH, useFactory: resolveGraphReportPath }, LoomService],
  exports: [LoomService],
})
export class LoomModule {}
