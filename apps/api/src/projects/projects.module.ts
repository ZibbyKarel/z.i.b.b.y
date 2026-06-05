import { Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { ProjectCategoriesController } from "./project-categories.controller"
import { ProjectCategoriesStorageService } from "./project-categories.storage.service"
import { ProjectsController } from "./projects.controller"
import { PROJECTS_DIR, ProjectsStorageService } from "./projects.storage.service"

/**
 * Default registry directory when `PROJECTS_DIR` is not set. Anchored to the api
 * app's own `apps/api/data/projects` (gitignored) via this file's location rather
 * than the process cwd, so dev and the test runner resolve to the same place
 * (same rationale as `resolveAgentsDir`).
 */
export function resolveProjectsDir(): string {
  return process.env.PROJECTS_DIR ?? dataDir("projects")
}

@Module({
  // ProjectCategoriesController is declared before ProjectsController so its
  // static route (`GET /projects/categories`) registers ahead of `/projects/:id`,
  // which would otherwise capture "categories" as a project id.
  controllers: [ProjectCategoriesController, ProjectsController],
  providers: [
    { provide: PROJECTS_DIR, useFactory: resolveProjectsDir },
    ProjectsStorageService,
    ProjectCategoriesStorageService,
  ],
  exports: [ProjectsStorageService, ProjectCategoriesStorageService],
})
export class ProjectsModule {}
