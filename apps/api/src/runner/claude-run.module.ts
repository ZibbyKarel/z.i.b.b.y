import { Module } from "@nestjs/common"
import { AGENTS_DIR, AgentsStorageService } from "../agents/agents.storage.service"
import { dataDir } from "../shared/data-dir"
import { SKILLS_DIR, SkillsStorageService } from "../skills/skills.storage.service"
import { ClaudePreflightService } from "./claude-preflight.service"
import { ClaudeRunCommandService } from "./claude-run-command.service"

/**
 * Provides the {@link ClaudeRunCommandService} (the `claude -p` command builder)
 * to the three runners. It owns its *own* read-only store instances pointed at
 * the same dirs as the agents/skills modules, rather than importing those
 * modules — that keeps this module free of any import cycle (Agents → ClaudeRun
 * → Agents). The stores are stateless file readers, so duplicate instances are
 * harmless. The dir factories mirror `resolveAgentsDir` / `resolveSkillsDir`.
 */
@Module({
  providers: [
    { provide: AGENTS_DIR, useFactory: () => process.env.AGENTS_DIR ?? dataDir("agents") },
    { provide: SKILLS_DIR, useFactory: () => process.env.SKILLS_DIR ?? dataDir("skills") },
    AgentsStorageService,
    SkillsStorageService,
    ClaudeRunCommandService,
    ClaudePreflightService,
  ],
  exports: [ClaudeRunCommandService, ClaudePreflightService],
})
export class ClaudeRunModule {}
