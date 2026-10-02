import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { ProjectsModule } from "../projects/projects.module";
import { MemoryModule } from "./memory.module";
import { RunRecorderService } from "./run-recorder.service";

/**
 * The run recorder (Phase 4): writes a durable trace of every finished run into
 * the vault. It consumes the runners (Agents/Workflows) AND the vault (Memory), so
 * it must sit a level ABOVE all three — Agents/Workflows already import Memory for
 * grounding, so a recorder inside MemoryModule would close a Nest DI cycle. This
 * is the exact shape TasksModule uses for outcome write-back.
 */
@Module({
  imports: [MemoryModule, AgentsModule, WorkflowsModule, ProjectsModule],
  providers: [RunRecorderService],
})
export class RunRecorderModule {}
