import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { TeamsModule } from "../teams/teams.module";
import { KbAuthModule } from "./kb-auth.module";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import { KbMcpController } from "./kb-mcp.controller";
import { KbReaderService } from "./kb-reader.service";
import { KbScopeService } from "./kb-scope.service";

/**
 * The `zibby-kb` MCP server (team-scoped, read-only knowledge-base search/read) —
 * see `docs/api/teams.md` for the full endpoint doc. `KbScopeService` needs
 * `TeamsModule`/`ProjectsModule`/`ResolvedProjectModule` (project → team → KB
 * resolution) plus `AgentsModule`/`PipelinesModule` (run → project resolution).
 *
 * `KbMcpAuthService` (the two per-boot bearer tokens, fix round 1's F3) lives
 * in the separate, LEAF `KbAuthModule` — see that module's doc for why: this
 * module transitively imports `ProjectsModule` → `MemoryModule` → `McpModule`,
 * so `McpModule` (and `ClaudeRunModule`) importing the FULL `KbModule` back
 * (to reach `KbMcpAuthService`) would close a real ES-import-level cycle,
 * which `forwardRef` cannot fix (it only defers a decorator's class
 * dereference, not the `import` statement itself). Re-exporting `KbAuthModule`
 * here keeps "KbModule provides and exports `KbMcpAuthService`" true for any
 * importer, while `KbAuthModule` itself stays a dead end with no imports.
 */
@Module({
  imports: [
    TeamsModule,
    ProjectsModule,
    ResolvedProjectModule,
    AgentsModule,
    PipelinesModule,
    KbAuthModule,
  ],
  controllers: [KbMcpController],
  providers: [KbScopeService, KbReaderService, KbMcpAuthGuard],
  exports: [KbAuthModule],
})
export class KbModule {}
