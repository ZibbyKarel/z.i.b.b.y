import { Module } from "@nestjs/common";
import { MemoryModule } from "../memory/memory.module";
import { GapDetectorService } from "./gap-detector.service";

/**
 * Gap detection (M5): scans 30 days of `task-created` activity for recurring manual
 * work and drafts "automate it?" suggestions into the vault. Imported by
 * AutomationsModule so the scheduler can dispatch the `gap-detect` system automation;
 * nothing here imports AutomationsModule, so there is no cycle.
 *
 * ActivityLogService comes from the global ActivityLogModule; LoggerService is also
 * @Global() — no explicit import needed.
 */
@Module({
  imports: [MemoryModule],
  providers: [GapDetectorService],
  exports: [GapDetectorService],
})
export class GapsModule {}
