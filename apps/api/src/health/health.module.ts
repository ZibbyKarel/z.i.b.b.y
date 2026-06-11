import { Module } from "@nestjs/common"
import { ClaudeRunModule } from "../runner/claude-run.module"
import { HealthController } from "./health.controller"

@Module({
  // ClaudeRunModule exports the preflight probe the readiness payload reports.
  imports: [ClaudeRunModule],
  controllers: [HealthController],
})
export class HealthModule {}
