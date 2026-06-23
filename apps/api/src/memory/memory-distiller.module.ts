import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ChatModule } from "../chat/chat.module";
import { GoalsModule } from "../goals/goals.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { ClaudeCliDistiller } from "./claude-cli-distiller";
import { MemoryModule } from "./memory.module";
import { MemoryDistillerService } from "./memory-distiller.service";

/**
 * Nightly memory distillation. Consumes the three runners (Agents/Pipelines/Goals)
 * AND the vault (Memory), so it sits a level ABOVE all of them — the runners already
 * import Memory for grounding, so a distiller inside MemoryModule would close a Nest
 * DI cycle. Same shape as RunRecorderModule and BriefingModule. AutomationsModule
 * imports this so the scheduler can dispatch the `memory-distill` system automation;
 * nothing here imports AutomationsModule, so there is no cycle.
 */
@Module({
  imports: [MemoryModule, AgentsModule, PipelinesModule, GoalsModule, ProjectsModule, ChatModule],
  providers: [ClaudeCliDistiller, MemoryDistillerService],
  exports: [MemoryDistillerService],
})
export class MemoryDistillerModule {}
