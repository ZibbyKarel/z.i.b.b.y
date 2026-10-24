import { Module } from "@nestjs/common";
import { MemoryModule } from "../memory/memory.module";
import { ProposalsModule } from "../proposals/proposals.module";
import { PatternExtractorService } from "./pattern-extractor.service";

/**
 * Pattern extraction: scans the 30-day approval-decision activity and drafts
 * rule proposals into the vault. Imported by AutomationsModule so the scheduler
 * can dispatch the `pattern-extract` system automation; nothing here imports
 * AutomationsModule, so there is no cycle.
 *
 * ActivityLogService comes from the global ActivityLogModule — no explicit import
 * needed. LoggerService is also @Global().
 */
@Module({
  imports: [MemoryModule, ProposalsModule],
  providers: [PatternExtractorService],
  exports: [PatternExtractorService],
})
export class PatternsModule {}
