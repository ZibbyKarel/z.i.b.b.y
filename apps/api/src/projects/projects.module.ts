import { Module, forwardRef } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MachineConfigModule } from "../machine/machine-config.module";
import { MergeWatchModule } from "../maestro/merge-watch.module";
import { MemoryModule } from "../memory/memory.module";
import { VAULT_DIR } from "../memory/vault.service";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ProjectLocalService } from "./project-local.service";
import { ProjectPrService } from "./project-pr.service";
import { PROJECT_SECRETS_DIR, ProjectSecretsStore } from "./project-secrets.store";
import { ProjectCategoriesController } from "./project-categories.controller";
import { ProjectCategoriesStorageService } from "./project-categories.storage.service";
import { ProjectVaultService } from "./project-vault.service";
import { ProjectsController } from "./projects.controller";
import { PROJECTS_DIR, ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectModule } from "./resolved-project.module";
import { StandupService } from "./standup.service";

/**
 * Default registry directory when `PROJECTS_DIR` is not set. Anchored to the api
 * app's own `apps/api/data/projects` (gitignored) via this file's location rather
 * than the process cwd, so dev and the test runner resolve to the same place
 * (same rationale as `resolveAgentsDir`).
 */
export function resolveProjectsDir(): string {
  return process.env.PROJECTS_DIR ?? dataDir("projects");
}

/** Default project-secrets dir (gitignored), anchored to `apps/api/data/project-secrets`. */
export function resolveProjectSecretsDir(): string {
  return process.env.PROJECT_SECRETS_DIR ?? dataDir("project-secrets");
}

@Module({
  // Phase 72: `ResolvedProjectModule` (via `forwardRef` — `ResolvedProjectModule`
  // already forwardRef-imports `IntegrationsModule`, which in turn imports THIS
  // module directly for the integration→project FK check; wrapping this edge too
  // keeps every link in that triangle safe to add in any order) so
  // `ProjectsController.getResolvedProject` can inject `ResolvedProjectService`.
  //
  // Phase 78: also imports `IntegrationsModule` directly (also `forwardRef` —
  // `IntegrationsModule` already forwardRef-imports THIS module, so the edge is
  // symmetric, same fix as the Phase 72 triangle above) so `ProjectPrService`
  // can inject `CredentialsStore` to read a resolved github integration's token.
  imports: [
    MemoryModule,
    forwardRef(() => ResolvedProjectModule),
    forwardRef(() => IntegrationsModule),
    // Phase 76: both leaf modules (no imports of their own) — no cycle risk.
    WorkspaceModule,
    MachineConfigModule,
    // NS2 F7b-2: leaf module (no imports of its own) — `ProjectPrService.merge`
    // records a `MergeWatch` on a successful merge. No cycle risk.
    MergeWatchModule,
  ],
  // ProjectCategoriesController is declared before ProjectsController so its
  // static route (`GET /projects/categories`) registers ahead of `/projects/:id`,
  // which would otherwise capture "categories" as a project id.
  controllers: [ProjectCategoriesController, ProjectsController],
  providers: [
    { provide: PROJECTS_DIR, useFactory: resolveProjectsDir },
    { provide: PROJECT_SECRETS_DIR, useFactory: resolveProjectSecretsDir },
    {
      provide: VAULT_DIR,
      useFactory: () => process.env.VAULT_DIR ?? dataDir("vault"),
    },
    ProjectsStorageService,
    ProjectCategoriesStorageService,
    ProjectSecretsStore,
    ProjectVaultService,
    StandupService,
    ProjectLocalService,
    ProjectPrService,
  ],
  exports: [
    ProjectsStorageService,
    ProjectCategoriesStorageService,
    ProjectSecretsStore,
    StandupService,
    ProjectLocalService,
    // NS2 F5b — Maestro reuses ProjectPrService.listOpen directly (the merge
    // queue's read side) rather than re-fetching pulls itself.
    ProjectPrService,
  ],
})
export class ProjectsModule {}
