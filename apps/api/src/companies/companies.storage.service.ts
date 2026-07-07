import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type Company,
  CompanySchema,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "@zibby/contracts";
import { backfillPersonIds } from "../shared/backfill-person-ids";
import { ensureDir, safeJson, searchByText, writeFileAtomic } from "../shared/file-storage";
import { CompanyConflictError, CompanyNotFoundError } from "./companies.errors";

/** DI token carrying the absolute path of the directory that holds the registry. */
export const COMPANIES_DIR = "COMPANIES_DIR";

/** Manifest file holding the company registry. */
const MANIFEST_FILE = "_companies.json";

/**
 * File-backed persistence for the company registry: a single JSON manifest
 * (`_companies.json`) in a configurable data directory — mirrors
 * `ProjectsStorageService` verbatim (Phase 69). A fresh install starts empty;
 * the manifest is created on the first `create`. The list is kept sorted by
 * id so callers get a stable order. Deleting a company that still has
 * projects pointing at it via `companyId` is allowed (no cascade) — the
 * dangling reference is resolved to "no company" at read time (Phase 70).
 */
@Injectable()
export class CompaniesStorageService {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(COMPANIES_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
  }

  async list(): Promise<Company[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop entries that no longer match the schema rather than failing the whole
    // listing (mirrors how the entity/category listings skip corrupt records).
    return parsed
      .flatMap((entry) => {
        const result = CompanySchema.safeParse(entry);
        return result.success ? [result.data] : [];
      })
      .map(backfillCompanyPersonIds)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Company> {
    const company = (await this.list()).find((c) => c.id === id);
    if (!company) throw new CompanyNotFoundError(id);
    return company;
  }

  /** Free-text search over the registry by id, name and desc. */
  async search(query: string): Promise<Company[]> {
    return searchByText(await this.list(), query, (c) => [c.id, c.name, c.desc]);
  }

  async create(input: CreateCompanyInput): Promise<Company> {
    const companies = await this.list();
    if (companies.some((c) => c.id === input.id)) {
      throw new CompanyConflictError(input.id);
    }
    const company = CompanySchema.parse(input);
    await this.writeAtomic([...companies, company]);
    return company;
  }

  async update(id: string, patch: UpdateCompanyInput): Promise<Company> {
    const companies = await this.list();
    const existing = companies.find((c) => c.id === id);
    if (!existing) throw new CompanyNotFoundError(id);
    const merged = CompanySchema.parse({ ...existing, ...patch, id: existing.id });
    await this.writeAtomic(companies.map((c) => (c.id === id ? merged : c)));
    return merged;
  }

  async delete(id: string): Promise<void> {
    const companies = await this.list();
    if (!companies.some((c) => c.id === id)) {
      throw new CompanyNotFoundError(id);
    }
    await this.writeAtomic(companies.filter((c) => c.id !== id));
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(companies: Company[]): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(companies, null, 2)}\n`);
  }
}

/**
 * Backfill missing `people[].id`s (Phase 69 migration decision — see
 * `ProjectPersonSchema`'s doc comment in `libs/contracts`). Returns the same
 * `company` reference when there is no roster or nothing to backfill.
 */
function backfillCompanyPersonIds(company: Company): Company {
  if (!company.people) return company;
  const backfilled = backfillPersonIds(company.people);
  if (backfilled === company.people) return company;
  return { ...company, people: backfilled };
}
