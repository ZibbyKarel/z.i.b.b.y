import { Module } from "@nestjs/common"
import { LimitsController } from "./limits.controller"
import { LimitsService } from "./limits.service"
import { ClaudeUsageReader } from "./usage.reader"

@Module({
  controllers: [LimitsController],
  providers: [LimitsService, ClaudeUsageReader],
})
export class LimitsModule {}
