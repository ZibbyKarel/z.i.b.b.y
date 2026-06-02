import { Module } from "@nestjs/common"
import { LimitsController } from "./limits.controller"
import { LimitsService } from "./limits.service"
import { RateLimitsReader } from "./rate-limits.reader"

@Module({
  controllers: [LimitsController],
  providers: [LimitsService, RateLimitsReader],
})
export class LimitsModule {}
