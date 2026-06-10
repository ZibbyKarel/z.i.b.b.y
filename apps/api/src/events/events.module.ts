import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { EventsController } from "./events.controller"

/**
 * Hosts the unified `/api/events` SSE channel. It pulls the agent and pipeline
 * runner services from their owning modules (both already export them) and merges
 * their status streams into one push channel for the dashboard.
 */
@Module({
  imports: [AgentsModule, PipelinesModule],
  controllers: [EventsController],
})
export class EventsModule {}
