import { Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { MemoryModule } from "../memory/memory.module"
import { VAULT_DIR } from "../memory/vault.service"
import { PROJECT_SECRETS_DIR, ProjectSecretsStore } from "./project-secrets.store"
import { ProjectCategoriesController } from "./project-categories.controller"
import { ProjectCategoriesStorageService } from "./project-categories.storage.service"
import { ProjectVaultService } from "./project-vault.service"
import { ProjectsController } from "./projects.controller"
import { PROJECTS_DIR, ProjectsStorageService } from "./projects.storage.service"
import { StandupService } from "./standup.service"

/**
 * Default registry directory when `PROJECTS_DIR` is not set. Anchored to the api
 * app's own `apps/api/data/projects` (gitignored) via this file's location rather
 * than the process cwd, so dev and the test runner resolve to the same place
 * (same rationale as `resolveAgentsDir`).
 */
export function resolveProjectsDir(): string {
  return process.env.PROJECTS_DIR ?? dataDir("projects")
}

/** Default project-secrets dir (gitignored), anchored to `apps/api/data/project-secrets`. */
export function resolveProjectSecretsDir(): string {
  return process.env.PROJECT_SECRETS_DIR ?? dataDir("project-secrets")
}

@Module({
  imports: [MemoryModule],
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
  ],
  exports: [ProjectsStorageService, ProjectCategoriesStorageService, ProjectSecretsStore, StandupService],
})
export class ProjectsModule {}
