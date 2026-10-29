import {
  EXTERNAL_SKILLS_DIR,
  EXTERNAL_SKILLS_FILE,
  ExternalSkillsStore,
  resolveExternalSkillsDir,
  resolveExternalSkillsFile,
} from "../external-skills/external-skills.store";
import { Module } from "@nestjs/common";
import { AGENTS_DIR, AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsModule } from "../approvals/approvals.module";
import { COMMANDS_DIR, CommandsStorageService } from "../commands/commands.storage.service";
import { HOOKS_DIR, HooksStorageService } from "../hooks/hooks.storage.service";
import { KbAuthModule } from "../kb/kb-auth.module";
import { KbMcpAuthGuard } from "../kb/kb-mcp-auth.guard";
import {
  MARKETPLACES_FILE,
  MarketplacesStore,
  resolveMarketplacesFile,
} from "../marketplaces/marketplaces.store";
import { MCP_CREDENTIALS_DIR, McpCredentialsStore } from "../mcp/mcp-credentials.store";
import { MCP_DIR, McpServersStorageService } from "../mcp/mcp.storage.service";
import { dataDir } from "../shared/data-dir";
import { SKILLS_DIR, SkillsStorageService } from "../skills/skills.storage.service";
import { ClaudePreflightService } from "./claude-preflight.service";
import { ClaudeRunCommandService } from "./claude-run-command.service";
import { CommandMaterializerService } from "./command-materializer.service";
import { RunMcpController } from "./run-mcp.controller";

/**
 * Provides the {@link ClaudeRunCommandService} (the `claude -p` command builder)
 * to the three runners. It owns its *own* read-only store instances pointed at
 * the same dirs as the agents/skills modules, rather than importing those
 * modules — that keeps this module free of any import cycle (Agents → ClaudeRun
 * → Agents). The stores are stateless file readers, so duplicate instances are
 * harmless. The dir factories mirror `resolveAgentsDir` / `resolveSkillsDir`.
 *
 * `KbAuthModule` is the one exception to "owns its own instances": it imports
 * that (leaf) module rather than duplicating `KbMcpAuthService` as a bare
 * provider, because `McpServersStorageService`'s constructor now requires it
 * (fix round 1, F3 — the two per-boot `zibby-kb` bearer tokens). A duplicate
 * `KbMcpAuthService` provider here would mint its OWN random token pair,
 * different from the one `KbMcpAuthGuard` (in `KbModule`) actually validates —
 * this module's own `McpServersStorageService` instance would then seed a
 * `zibby-kb` credential that the real guard would 401. Importing `KbAuthModule`
 * instead gets the SAME app-wide singleton `KbMcpAuthService` NestJS shares
 * with every other importer, so both `McpServersStorageService` instances
 * (this one and `McpModule`'s) and the guard agree on one token pair.
 *
 * It also hosts the `zibby-run` MCP endpoint ({@link RunMcpController}, D-ASK),
 * behind the same `KbMcpAuthGuard` / run token. `ApprovalsModule` imports no runner
 * module, so importing it here closes no cycle.
 */
@Module({
  imports: [KbAuthModule, ApprovalsModule],
  controllers: [RunMcpController],
  providers: [
    KbMcpAuthGuard,
    { provide: AGENTS_DIR, useFactory: () => process.env.AGENTS_DIR ?? dataDir("agents") },
    { provide: SKILLS_DIR, useFactory: () => process.env.SKILLS_DIR ?? dataDir("skills") },
    // SkillsStorageService merges external (GitHub-installed) skills; re-read per call.
    { provide: EXTERNAL_SKILLS_FILE, useFactory: resolveExternalSkillsFile },
    { provide: EXTERNAL_SKILLS_DIR, useFactory: resolveExternalSkillsDir },
    ExternalSkillsStore,
    { provide: HOOKS_DIR, useFactory: () => process.env.HOOKS_DIR ?? dataDir("hooks") },
    { provide: MCP_DIR, useFactory: () => process.env.MCP_DIR ?? dataDir("mcp-servers") },
    {
      provide: MCP_CREDENTIALS_DIR,
      useFactory: () => process.env.MCP_CREDENTIALS_DIR ?? dataDir("mcp-credentials"),
    },
    { provide: COMMANDS_DIR, useFactory: () => process.env.COMMANDS_DIR ?? dataDir("commands") },
    AgentsStorageService,
    SkillsStorageService,
    HooksStorageService,
    McpServersStorageService,
    McpCredentialsStore,
    CommandsStorageService,
    // Re-read per call, so this second instance always sees MarketplacesModule's writes.
    { provide: MARKETPLACES_FILE, useFactory: resolveMarketplacesFile },
    MarketplacesStore,
    ClaudeRunCommandService,
    ClaudePreflightService,
    CommandMaterializerService,
  ],
  exports: [ClaudeRunCommandService, ClaudePreflightService, CommandMaterializerService],
})
export class ClaudeRunModule {}
