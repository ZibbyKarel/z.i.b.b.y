import * as path from "node:path"
import { Module } from "@nestjs/common"
import { AgentsController } from "./agents.controller"
import { AGENTS_DIR, AgentsStorageService } from "./agents.storage.service"
import { CategoriesController } from "./categories.controller"
import { CategoriesStorageService } from "./categories.storage.service"

/**
 * Default data directory when `AGENTS_DIR` is not set. Anchored to the api app's
 * own `apps/api/data/agents` (gitignored) via this file's location rather than
 * the process cwd, so dev (`ts-node`, cwd `apps/api`) and the test runner
 * (cwd = repo root) resolve to the same place instead of scattering a stray
 * `data/agents` wherever the process happened to start.
 */
export function resolveAgentsDir(): string {
  return process.env.AGENTS_DIR ?? path.resolve(__dirname, "..", "..", "data", "agents")
}

@Module({
  // CategoriesController is declared first so its `GET /agents/categories` route
  // is registered before the agents resource's `GET /agents/:id`, which would
  // otherwise capture "categories" as an agent id (an e2e test guards this).
  controllers: [CategoriesController, AgentsController],
  providers: [
    { provide: AGENTS_DIR, useFactory: resolveAgentsDir },
    AgentsStorageService,
    CategoriesStorageService,
  ],
  exports: [AgentsStorageService, CategoriesStorageService],
})
export class AgentsModule {}
