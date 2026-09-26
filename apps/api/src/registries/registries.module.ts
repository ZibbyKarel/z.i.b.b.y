import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { CommandsModule } from "../commands/commands.module";
import { HooksModule } from "../hooks/hooks.module";
import { McpModule } from "../mcp/mcp.module";
import { SkillsModule } from "../skills/skills.module";
import { RegistriesController } from "./registries.controller";
import { RegistriesService } from "./registries.service";

/** ZB-11 — derived "Bound in" data for `/system/registries/[kind]` (O-09). */
@Module({
  imports: [AgentsModule, SkillsModule, HooksModule, McpModule, CommandsModule],
  controllers: [RegistriesController],
  providers: [RegistriesService],
})
export class RegistriesModule {}
