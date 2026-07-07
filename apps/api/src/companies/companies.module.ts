import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { CompaniesController } from "./companies.controller";
import { COMPANIES_DIR, CompaniesStorageService } from "./companies.storage.service";

/**
 * Default registry directory when `COMPANIES_DIR` is not set. Anchored to the
 * api app's own `apps/api/data/companies` (gitignored) via this file's
 * location rather than the process cwd (same rationale as
 * `resolveProjectsDir`), so dev and the test runner resolve to the same place.
 */
export function resolveCompaniesDir(): string {
  return process.env.COMPANIES_DIR ?? dataDir("companies");
}

@Module({
  controllers: [CompaniesController],
  providers: [
    { provide: COMPANIES_DIR, useFactory: resolveCompaniesDir },
    CompaniesStorageService,
  ],
  exports: [CompaniesStorageService],
})
export class CompaniesModule {}
