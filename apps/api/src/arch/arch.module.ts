import { Module } from "@nestjs/common";
import { SignalBusModule } from "../automations/signal-bus.module";
import { resolveGraphReportPath } from "../self-knowledge/self-knowledge.module";
import { GRAPH_REPORT_PATH } from "../self-knowledge/self-knowledge.service";
import { MemoryModule } from "../memory/memory.module";
import { DepartmentFindingsModule } from "../departments/department-findings.module";
import { ArchService } from "./arch.service";

/**
 * NS2 F5c — Arch's nightly quality audit. A leaf module (like `SecurityModule`):
 * imported by `AutomationsModule` (the scheduler target) and `BriefingModule`
 * (the findings extras array) but imports neither back — no cycle risk, same
 * position as `sec`. Reuses `SelfKnowledgeModule`'s `GRAPH_REPORT_PATH`
 * token + `resolveGraphReportPath()` factory (same file, same cwd-independent
 * resolution) rather than duplicating it — the token is just a string, so
 * providing it again here is independent DI scoping, not a shared instance.
 *
 * Also imports `SignalBusModule` — each audit run's new findings are emitted as one
 * `audit-batch` signal that signal-triggered automations may pick up.
 */
@Module({
  imports: [MemoryModule, DepartmentFindingsModule, SignalBusModule],
  providers: [{ provide: GRAPH_REPORT_PATH, useFactory: resolveGraphReportPath }, ArchService],
  exports: [ArchService],
})
export class ArchModule {}
