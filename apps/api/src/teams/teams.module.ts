import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { TeamsController } from "./teams.controller";
import { TEAMS_DIR, TeamsStorageService } from "./teams.storage.service";

/**
 * Default registry directory when `TEAMS_DIR` is not set. Anchored to the api
 * app's own `apps/api/data/teams` (gitignored) via this file's location
 * rather than the process cwd (same rationale as `resolveCompaniesDir`), so
 * dev and the test runner resolve to the same place.
 */
export function resolveTeamsDir(): string {
  return process.env.TEAMS_DIR ?? dataDir("teams");
}

@Module({
  controllers: [TeamsController],
  providers: [{ provide: TEAMS_DIR, useFactory: resolveTeamsDir }, TeamsStorageService],
  exports: [TeamsStorageService],
})
export class TeamsModule {}
