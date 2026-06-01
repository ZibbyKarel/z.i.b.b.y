import * as path from "node:path"
import { Module } from "@nestjs/common"
import { AgentsController } from "./agents.controller"
import { AGENTS_DIR, AgentsStorageService } from "./agents.storage.service"

/** Default data directory when `AGENTS_DIR` is not set — never an absolute hardcode. */
export function resolveAgentsDir(): string {
  return process.env.AGENTS_DIR ?? path.join(process.cwd(), "data", "agents")
}

@Module({
  controllers: [AgentsController],
  providers: [
    { provide: AGENTS_DIR, useFactory: resolveAgentsDir },
    AgentsStorageService,
  ],
  exports: [AgentsStorageService],
})
export class AgentsModule {}
