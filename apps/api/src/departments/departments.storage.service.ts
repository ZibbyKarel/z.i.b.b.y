import { promises as fs } from "node:fs";
import { Inject, Injectable } from "@nestjs/common";
import {
  DEPARTMENT_SEED,
  type Department,
  DepartmentIdSchema,
  DepartmentSchema,
} from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";
import {
  DepartmentConflictError,
  DepartmentNotFoundError,
  InvalidDepartmentIdError,
} from "./departments.errors";

/** DI token carrying the absolute path of the directory that holds department files. */
export const DEPARTMENTS_DIR = "DEPARTMENTS_DIR";

const SEED_ORDER: readonly string[] = DEPARTMENT_SEED.map((d) => d.id);

/**
 * D-022 — departments as data: one `<id>.json` per department under
 * `.zibby/data/departments/`, seeded once from `DEPARTMENT_SEED` (stored files
 * always win afterwards). The `findings/` subdirectory is not an entity — the base
 * listing only reads `*.json` files that parse as a `Department`.
 */
@Injectable()
export class DepartmentsStorageService extends EntityFileStore<Department> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = /^[a-z][a-z0-9-]{1,23}$/;

  constructor(@Inject(DEPARTMENTS_DIR) dir: string) {
    super(dir);
  }

  /** Seed on first boot: only when the dir holds no department `*.json` yet. */
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.ensureSeeded();
  }

  /** Memoised: seeding runs once per process, whichever read/hook gets there first. */
  private seeding?: Promise<void>;

  ensureSeeded(): Promise<void> {
    return (this.seeding ??= this.seed());
  }

  override async list(): Promise<Department[]> {
    await this.ensureSeeded();
    return super.list();
  }

  override async get(id: string): Promise<Department> {
    await this.ensureSeeded();
    return super.get(id);
  }

  /** Display name for `id`, falling back to the raw id when the department is unknown. */
  async nameOf(id: string): Promise<string> {
    return (await this.get(id).catch(() => null))?.name ?? id;
  }

  private async seed(): Promise<void> {
    await this.ensureDir();
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    if (entries.some((e) => e.endsWith(".json") && !e.startsWith("_"))) return;
    for (const department of DEPARTMENT_SEED) {
      await this.createEntity(department.id, () => department);
    }
  }

  /** `true` when `id` names a stored department. Never throws (bad id → false). */
  async exists(id: string): Promise<boolean> {
    if (!DepartmentIdSchema.safeParse(id).success) return false;
    return this.get(id).then(
      () => true,
      () => false,
    );
  }

  /** The first id in `ids` that names no stored department (`undefined`/empty skipped), else `null`. */
  async firstMissing(ids: readonly (string | undefined)[]): Promise<string | null> {
    for (const id of ids) {
      if (id !== undefined && !(await this.exists(id))) return id;
    }
    return null;
  }

  /** Write-boundary guard: throws `DepartmentNotFoundError` for an unknown id. */
  async assertExists(id: string): Promise<void> {
    if (!(await this.exists(id))) throw new DepartmentNotFoundError(id);
  }

  /** Create-if-absent; a duplicate id throws `DepartmentConflictError` (409). */
  async create(department: Department): Promise<Department> {
    const created = await this.createEntity(department.id, () => department);
    if (!created) throw new DepartmentConflictError(department.id);
    return created;
  }

  update(id: string, patch: Partial<Department>): Promise<Department> {
    return this.updateEntity(id, (current) => ({ ...current, ...patch, id: current.id }));
  }

  protected idOf(department: Department): string {
    return department.id;
  }

  protected serialize(department: Department): string {
    return JSON.stringify(department, null, 2);
  }

  protected tryParse(raw: string): Department | null {
    return this.parseJson(DepartmentSchema, raw);
  }

  /** Seeded departments keep org-chart order; later ones follow by `createdAt`, then id. */
  protected compare(a: Department, b: Department): number {
    const rank = (d: Department): number => {
      const i = SEED_ORDER.indexOf(d.id);
      return i === -1 ? SEED_ORDER.length : i;
    };
    return (
      rank(a) - rank(b) ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
      a.id.localeCompare(b.id)
    );
  }

  protected notFound(id: string): Error {
    return new DepartmentNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidDepartmentIdError(id);
  }
}
