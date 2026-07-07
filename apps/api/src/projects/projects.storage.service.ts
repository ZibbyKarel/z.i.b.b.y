import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateProjectInput,
  type Project,
  ProjectSchema,
  type UpdateProjectInput,
} from "@zibby/contracts";
import { backfillPersonIds } from "../shared/backfill-person-ids";
import { ensureDir, safeJson, searchByText, writeFileAtomic } from "../shared/file-storage";
import { ProjectConflictError, ProjectNotFoundError } from "./projects.errors";

/** DI token carrying the absolute path of the directory that holds the registry. */
export const PROJECTS_DIR = "PROJECTS_DIR";

/** Manifest file holding the project registry. */
const MANIFEST_FILE = "_projects.json";

/**
 * File-backed persistence for the project registry: a single JSON manifest
 * (`_projects.json`) in a configurable data directory. Projects are a *registry*
 * of target directories, not files of their own — deleting a project removes only
 * its record here; the files it points at on the host are untouched. A fresh
 * install starts empty; the manifest is created on the first `create`. The list
 * is kept sorted by id so callers get a stable order.
 */
@Injectable()
export class ProjectsStorageService {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(PROJECTS_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
  }

  async list(): Promise<Project[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop entries that no longer match the schema rather than failing the whole
    // listing (mirrors how the entity/category listings skip corrupt records).
    return parsed
      .flatMap((entry) => {
        const result = ProjectSchema.safeParse(entry);
        return result.success ? [result.data] : [];
      })
      .map(backfillProjectPersonIds)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Project> {
    const project = (await this.list()).find((p) => p.id === id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }

  /** Free-text search over the registry by id, name, desc, path and category. */
  async search(query: string): Promise<Project[]> {
    return searchByText(await this.list(), query, (p) => [
      p.id,
      p.name,
      p.desc,
      p.path,
      p.category,
    ]);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const projects = await this.list();
    if (projects.some((p) => p.id === input.id)) {
      throw new ProjectConflictError(input.id);
    }
    const project = ProjectSchema.parse(input);
    await this.writeAtomic([...projects, project]);
    return project;
  }

  async update(id: string, patch: UpdateProjectInput): Promise<Project> {
    const projects = await this.list();
    const existing = projects.find((p) => p.id === id);
    if (!existing) throw new ProjectNotFoundError(id);
    const merged = ProjectSchema.parse({ ...existing, ...patch, id: existing.id });
    await this.writeAtomic(projects.map((p) => (p.id === id ? merged : p)));
    return merged;
  }

  async delete(id: string): Promise<void> {
    const projects = await this.list();
    if (!projects.some((p) => p.id === id)) {
      throw new ProjectNotFoundError(id);
    }
    await this.writeAtomic(projects.filter((p) => p.id !== id));
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(projects: Project[]): Promise<void> {
    await ensureDir(this.dir);
    // `hasSecrets` is computed at read time from the separate secrets store — never
    // persist it on the registry entity (mirrors integrations' `hasCredentials`).
    const persisted = projects.map((project) => {
      const copy = { ...project };
      delete copy.hasSecrets;
      return copy;
    });
    await writeFileAtomic(this.file, `${JSON.stringify(persisted, null, 2)}\n`);
  }
}

/**
 * Backfill missing `identity.people[].id`s (Phase 69 migration decision — see
 * `ProjectPersonSchema`'s doc comment in `libs/contracts`). Returns the same
 * `project` reference when there is no roster or nothing to backfill, so a
 * project with no people never gets copied for nothing.
 */
function backfillProjectPersonIds(project: Project): Project {
  if (!project.identity?.people) return project;
  const backfilled = backfillPersonIds(project.identity.people);
  if (backfilled === project.identity.people) return project;
  return { ...project, identity: { ...project.identity, people: backfilled } };
}
