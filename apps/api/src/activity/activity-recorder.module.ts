import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { ActivityRecorderService } from "./activity-recorder.service";

/**
 * Subscribes both runners and records run transitions into the activity log —
 * the {@link RunRecorderModule} twin. It imports Agents + Workflows for the runner
 * services; {@link ActivityLogService} is global so it needs no import. Registered
 * near RunRecorderModule in {@link AppModule}.
 */
@Module({
  imports: [AgentsModule, WorkflowsModule],
  providers: [ActivityRecorderService],
})
export class ActivityRecorderModule {}
