import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { TeamsModule } from "../teams/teams.module";
import { KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import { KbMcpController } from "./kb-mcp.controller";
import { KbReaderService } from "./kb-reader.service";
import { KbScopeService } from "./kb-scope.service";

/**
 * The `zibby-kb` MCP server (team-scoped, read-only knowledge-base search/read) —
 * see `docs/api/teams.md` for the full endpoint doc. `KbScopeService` needs
 * `TeamsModule`/`ProjectsModule`/`ResolvedProjectModule` (project → team → KB
 * resolution) plus `AgentsModule`/`PipelinesModule` (run → project resolution);
 * none of those modules import this one back, so no `forwardRef` is needed here.
 */
@Module({
  imports: [TeamsModule, ProjectsModule, ResolvedProjectModule, AgentsModule, PipelinesModule],
  controllers: [KbMcpController],
  providers: [KbScopeService, KbReaderService, KbMcpAuthGuard],
})
export class KbModule {}
