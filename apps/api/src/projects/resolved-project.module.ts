import { Module, forwardRef } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { IntegrationsModule } from "../integrations/integrations.module";
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
 */
@Module({
  imports: [CompaniesModule, forwardRef(() => IntegrationsModule)],
  providers: [ResolvedProjectService],
  exports: [ResolvedProjectService],
})
export class ResolvedProjectModule {}
