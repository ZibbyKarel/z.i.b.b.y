import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  DEPARTMENT_SEED,
  DIVISION_SEED,
  type Department,
  DepartmentIdSchema,
  DepartmentSchema,
  type Division,
  DivisionSchema,
} from "@zibby/contracts";
import { z } from "zod";
import { EntityFileStore, safeJson, writeFileAtomic } from "../shared/file-storage";
import {
  DepartmentConflictError,
  DepartmentNotFoundError,
  InvalidDepartmentIdError,
} from "./departments.errors";

/** DI token carrying the absolute path of the directory that holds department files. */
export const DEPARTMENTS_DIR = "DEPARTMENTS_DIR";

/** The single divisions manifest, beside the department files (`_`-prefixed → never an entity). */
const DIVISIONS_FILE = "_divisions.json";

const SEED_ORDER: readonly string[] = DEPARTMENT_SEED.map((d) => d.id);

/**
 * D-022 — departments as data: one `<id>.json` per department under
 * `.zibby/data/departments/`, seeded once from `DEPARTMENT_SEED` (stored files
 * always win afterwards). `_divisions.json` holds the divisions manifest; it and
 * the `findings/` subdirectory are not entities — the base listing only reads
 * `*.json` files that parse as a `Department`, so both fall out naturally.
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
    const file = path.join(this.dir, DIVISIONS_FILE);
    await fs.access(file).catch(() => writeFileAtomic(file, JSON.stringify(DIVISION_SEED)));
  }

  async listDivisions(): Promise<Division[]> {
    const raw = await fs.readFile(path.join(this.dir, DIVISIONS_FILE), "utf8").catch(() => null);
    const parsed = z.array(DivisionSchema).safeParse(raw === null ? null : safeJson(raw));
    const divisions = parsed.success ? parsed.data : [...DIVISION_SEED];
    return divisions.sort((a, b) => a.order - b.order);
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
