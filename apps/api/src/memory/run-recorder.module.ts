import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { ProjectsModule } from "../projects/projects.module"
import { MemoryModule } from "./memory.module"
import { RunRecorderService } from "./run-recorder.service"

/**
 * The run recorder (Phase 4): writes a durable trace of every finished run into
 * the vault. It consumes the runners (Agents/Pipelines) AND the vault (Memory), so
 * it must sit a level ABOVE all three — Agents/Pipelines already import Memory for
 * grounding, so a recorder inside MemoryModule would close a Nest DI cycle. This
 * is the exact shape TasksModule uses for outcome write-back.
 */
@Module({
  imports: [MemoryModule, AgentsModule, PipelinesModule, ProjectsModule],
  providers: [RunRecorderService],
})
export class RunRecorderModule {}
