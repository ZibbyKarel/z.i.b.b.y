import { Global, Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { DEPARTMENTS_DIR, DepartmentsStorageService } from "./departments.storage.service";

/** Default departments dir: `.zibby/data/departments` (override: `DEPARTMENTS_DIR`). */
export function resolveDepartmentsDir(): string {
  return process.env.DEPARTMENTS_DIR ?? dataDir("departments");
}

/**
 * D-022 — the departments file store as a global leaf module: nearly every
 * feature module needs a runtime "does this department exist / what is its
 * fallback" lookup, and `DepartmentsModule` itself imports most of them, so a
 * dedicated leaf (no imports) keeps the graph acyclic. Same shape as
 * `DepartmentFindingsModule`.
 */
@Global()
@Module({
  providers: [
    { provide: DEPARTMENTS_DIR, useFactory: resolveDepartmentsDir },
    DepartmentsStorageService,
  ],
  exports: [DepartmentsStorageService],
})
export class DepartmentsStoreModule {}
