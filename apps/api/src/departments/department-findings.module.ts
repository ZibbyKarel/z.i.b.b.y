import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { DEPARTMENT_FINDINGS_DIR, DepartmentFindingsStore } from "./department-findings.store";

/** Default findings-snapshot dir, anchored to `apps/api/data/departments/findings`. */
export function resolveDepartmentFindingsDir(): string {
  return process.env.DEPARTMENT_FINDINGS_DIR ?? dataDir("departments", "findings");
}

/**
 * NS2 F5a — the shared snapshot-store leaf module, imported by `SecurityModule`
 * and `ArchModule` (F5c). Deliberately NOT folded into `DepartmentsModule` — that
 * module imports Pipelines/Chains/Approvals/Tasks/Agents/Integrations, and
 * neither Security nor Arch needs any of that; a plain leaf module keeps both
 * chairs' dependency graphs small (no cycle risk either way).
 */
@Module({
  providers: [
    { provide: DEPARTMENT_FINDINGS_DIR, useFactory: resolveDepartmentFindingsDir },
    DepartmentFindingsStore,
  ],
  exports: [DepartmentFindingsStore],
})
export class DepartmentFindingsModule {}
