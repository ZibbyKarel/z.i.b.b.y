import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ActivityRecorderService } from "./activity-recorder.service";

/**
 * Subscribes both runners and records run transitions into the activity log —
 * the {@link RunRecorderModule} twin. It imports Agents + Pipelines for the runner
 * services; {@link ActivityLogService} is global so it needs no import. Registered
 * near RunRecorderModule in {@link AppModule}.
 */
@Module({
  imports: [AgentsModule, PipelinesModule],
  providers: [ActivityRecorderService],
})
export class ActivityRecorderModule {}
