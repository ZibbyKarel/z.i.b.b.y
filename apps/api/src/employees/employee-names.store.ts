import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type EmployeeName, EmployeeNameSchema } from "@zibby/contracts";
import {
  collisionResistantId,
  ensureDir,
  safeJson,
  withPathLock,
  writeFileAtomic,
} from "../shared/file-storage";
import {
  EmployeeNameConflictError,
  EmployeeNameInUseError,
  EmployeeNameNotFoundError,
  EmployeeNamePoolEmptyError,
  EmployeeNameUnavailableError,
} from "./employees.errors";

/** DI token carrying the absolute path of the directory that holds `employee-names.json`. */
export const EMPLOYEE_NAMES_DIR = "EMPLOYEE_NAMES_DIR";

/** Manifest file holding the name pool. */
const MANIFEST_FILE = "employee-names.json";

/**
 * PART-E's 30 Minion-style seed names plus 30 more (D-018), inserted verbatim (this order) the first
 * time the manifest is read and the file is absent. Never reorder/edit this list —
 * the migration script (`tools/migrate/zibbycorp-employees.mjs`) hires against the
 * SAME order, so a name pool seeded by the API and one seeded by the migration
 * agree byte-for-byte.
 */
export const EMPLOYEE_NAME_SEED: readonly string[] = [
  "Kevin",
  "Stuart",
  "Bob",
  "Dave",
  "Jerry",
  "Carl",
  "Phil",
  "Tim",
  "Mark",
  "Tom",
  "Jorge",
  "Norbert",
  "Otto",
  "Mel",
  "Lance",
  "Steve",
  "Donnie",
  "Mike",
  "Ken",
  "Chris",
  "John",
  "Paul",
  "Larry",
  "Herb",
  "Walter",
  "Gus",
  "Barry",
  "Frank",
  "Lenny",
  "Ziggy",
  // D-018: 30 more, appended so the operator's first 30 keep their order.
  "Tony",
  "Eric",
  "Henry",
  "Norman",
  "Brian",
  "Pete",
  "Ron",
  "Felix",
  "Jimmy",
  "Dan",
  "Sid",
  "Ralph",
  "Vince",
  "Leo",
  "Max",
  "Rudy",
  "Hank",
  "Moe",
  "Sam",
  "Nick",
  "Ted",
  "Joe",
  "Ed",
  "Hugo",
  "Vito",
  "Bruno",
  "Gary",
  "Ollie",
  "Rex",
  "Zeke",
];

/**
 * File-backed persistence for the name pool (D-015): a single JSON manifest
 * (`employee-names.json`), seeded with {@link EMPLOYEE_NAME_SEED} on first read
 * when absent — mirrors `TeamsStorageService`'s single-manifest shape. Every
 * mutating operation is serialized through `withPathLock` (keyed on the manifest
 * path) so two concurrent hires can never double-claim the same free name.
 */
@Injectable()
export class EmployeeNamesStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(EMPLOYEE_NAMES_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
  }

  async list(): Promise<EmployeeName[]> {
    return (await this.readOrSeed()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<EmployeeName> {
    const found = (await this.readOrSeed()).find((n) => n.id === id);
    if (!found) throw new EmployeeNameNotFoundError(id);
    return found;
  }

  async create(name: string): Promise<EmployeeName> {
    return withPathLock(this.file, async () => {
      const names = await this.readOrSeed();
      if (names.some((n) => n.name === name)) throw new EmployeeNameConflictError(name);
      const entry: EmployeeName = { id: collisionResistantId("empname"), name };
      await this.writeAtomic([...names, entry]);
      return entry;
    });
  }

  async rename(id: string, name: string): Promise<EmployeeName> {
    return withPathLock(this.file, async () => {
      const names = await this.readOrSeed();
      const existing = names.find((n) => n.id === id);
      if (!existing) throw new EmployeeNameNotFoundError(id);
      if (names.some((n) => n.id !== id && n.name === name)) {
        throw new EmployeeNameConflictError(name);
      }
      const next = { ...existing, name };
      await this.writeAtomic(names.map((n) => (n.id === id ? next : n)));
      return next;
    });
  }

  async delete(id: string): Promise<void> {
    await withPathLock(this.file, async () => {
      const names = await this.readOrSeed();
      const existing = names.find((n) => n.id === id);
      if (!existing) throw new EmployeeNameNotFoundError(id);
      if (existing.employeeId) throw new EmployeeNameInUseError(existing.name);
      await this.writeAtomic(names.filter((n) => n.id !== id));
    });
  }

  /**
   * Atomically claim a name for `employeeId` — either the exact `preferredName`
   * (must exist in the pool and be free) or, when omitted, the first free entry
   * in pool order. Throws {@link EmployeeNameUnavailableError} for an unknown or
   * already-held preferred name, {@link EmployeeNamePoolEmptyError} when no name
   * was requested and none is free.
   */
  async claimAndAssign(
    preferredName: string | undefined,
    employeeId: string,
  ): Promise<EmployeeName> {
    return withPathLock(this.file, async () => {
      const names = await this.readOrSeed();
      let target: EmployeeName | undefined;
      if (preferredName) {
        target = names.find((n) => n.name === preferredName);
        if (!target || target.employeeId) throw new EmployeeNameUnavailableError(preferredName);
      } else {
        target = names.find((n) => !n.employeeId);
        if (!target) throw new EmployeeNamePoolEmptyError();
      }
      const claimed = { ...target, employeeId };
      await this.writeAtomic(names.map((n) => (n.id === target!.id ? claimed : n)));
      return claimed;
    });
  }

  /** Release the name held by `employeeId` (a no-op if it holds none — fire is idempotent-safe). */
  async releaseByEmployeeId(employeeId: string): Promise<void> {
    await withPathLock(this.file, async () => {
      const names = await this.readOrSeed();
      const held = names.find((n) => n.employeeId === employeeId);
      if (!held) return;
      const released: EmployeeName = { id: held.id, name: held.name };
      await this.writeAtomic(names.map((n) => (n.id === held.id ? released : n)));
    });
  }

  /** Read the manifest, seeding it in place with {@link EMPLOYEE_NAME_SEED} when absent. */
  private async readOrSeed(): Promise<EmployeeName[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw !== null) {
      const parsed = safeJson(raw);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((entry) => {
          const result = EmployeeNameSchema.safeParse(entry);
          return result.success ? [result.data] : [];
        });
      }
    }
    const seeded = EMPLOYEE_NAME_SEED.map((name) => ({
      id: collisionResistantId("empname"),
      name,
    }));
    await this.writeAtomic(seeded);
    return seeded;
  }

  private async writeAtomic(names: EmployeeName[]): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(names, null, 2)}\n`);
  }
}
