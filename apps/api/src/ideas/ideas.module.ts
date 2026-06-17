import { Module } from "@nestjs/common"
import { MemoryModule } from "../memory/memory.module"
import { ResearchModule } from "../research/research.module"
import { IdeaGeneratorService } from "./idea-generator.service"

/**
 * App-ideas generation (north-star "Proposes ... app ideas"; M6 weekly bonus).
 * Pairs the operator's research interests with the latest digest trends into vault
 * suggestions. Imports ResearchModule (config + latest digest) and MemoryModule (the
 * vault write surface); imported by AutomationsModule so the scheduler can dispatch
 * the `app-ideas` system automation. Nothing here imports AutomationsModule (no cycle).
 */
@Module({
  imports: [MemoryModule, ResearchModule],
  providers: [IdeaGeneratorService],
  exports: [IdeaGeneratorService],
})
export class IdeasModule {}
