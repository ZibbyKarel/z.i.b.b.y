import { Module } from "@nestjs/common";
import { LimitsController } from "./limits.controller";
import { LimitsService } from "./limits.service";
import { RateLimitsReader } from "./rate-limits.reader";
import { UsageFetcher } from "./usage-fetcher";

@Module({
  controllers: [LimitsController],
  providers: [LimitsService, RateLimitsReader, UsageFetcher],
  exports: [LimitsService],
})
export class LimitsModule {}
