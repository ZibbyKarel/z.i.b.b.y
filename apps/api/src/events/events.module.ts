import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ChannelsModule } from "../channels/channels.module";
import { GoalsModule } from "../goals/goals.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { EventsController } from "./events.controller";

/**
 * Hosts the unified `/api/events` SSE channel. It pulls the agent, workflow
 * and goal runner services and the channel events service from their
 * owning modules (all exported) and merges their streams into one push
 * channel for the dashboard.
 */
@Module({
  imports: [AgentsModule, WorkflowsModule, GoalsModule, ChannelsModule],
  controllers: [EventsController],
})
export class EventsModule {}
