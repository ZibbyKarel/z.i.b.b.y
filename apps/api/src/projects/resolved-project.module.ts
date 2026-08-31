import { Module, forwardRef } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { TeamsModule } from "../teams/teams.module";
import { ProjectsModule } from "./projects.module";
import { ResolvedProjectService } from "./resolved-project.service";

/**
 * Phase 70: the resolved-project context service, wired as its own small module
 * rather than folded into `ProjectsModule` — `ResolvedProjectService` depends on
 * `CompaniesStorageService` and `IntegrationsStorageService`, and `IntegrationsModule`
 * already imports `ProjectsModule` (for the integration→project FK check), so a
 * consumer needing BOTH projects and this resolver (e.g. `IntegrationsController`
 * itself, for its company-merged listing) would otherwise create
 * `IntegrationsModule → ResolvedProjectModule → IntegrationsModule`. `forwardRef`
 * on both sides of that one edge breaks the cycle; nothing else in the graph needs
 * it (`CompaniesModule` is a leaf).
 *
 * Phase 3 (team knowledge base): `knowledgeBaseFor(projectId)` needs
 * `ProjectsStorageService` directly (it takes an id, not an already-loaded
 * `Project`), so this module now also imports `ProjectsModule` — `forwardRef` on
 * this side too, since `ProjectsModule` already `forwardRef`-imports THIS module
 * (for `ProjectsController.getResolvedProject`), making this a second edge in the
 * same existing cycle. `TeamsModule` is a leaf (no imports of its own, same as
 * `CompaniesModule`) — no cycle risk, imported plainly.
 */
@Module({
  imports: [
    CompaniesModule,
    forwardRef(() => IntegrationsModule),
    TeamsModule,
    forwardRef(() => ProjectsModule),
  ],
  providers: [ResolvedProjectService],
  exports: [ResolvedProjectService],
})
export class ResolvedProjectModule {}
