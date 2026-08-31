import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type CreateProjectInput,
  type Project,
  ProjectSchema,
  type UpdateProjectInput,
} from "@zibby/contracts";
import { backfillPersonIds } from "../shared/backfill-person-ids";
import {
  AvatarAssetStore,
  ensureDir,
  safeJson,
  searchByText,
  writeFileAtomic,
} from "../shared/file-storage";
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
  private readonly logger = new Logger(ProjectsStorageService.name);
  /** Externalizes uploaded `data:image/*` logos to `<dir>/assets/` (Phase 113). */
  private readonly logoAssets: AvatarAssetStore;

  constructor(@Inject(PROJECTS_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
    this.logoAssets = new AvatarAssetStore(this.dir);
  }

  /**
   * Ensure the registry directory exists, then run a one-shot, idempotent sweep
   * (Phase 113) that externalizes any pre-existing inline `data:` logo left in
   * the raw manifest from before uploads were split into asset files — a no-op
   * once every project has already been migrated.
   */
  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir);
    await this.sweepInlineLogos();
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
        const result = ProjectSchema.safeParse(this.inlineLogoRef(entry));
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
    // `companyId: null` (Phase 72) is the explicit "unlink the company" signal —
    // distinct from an ABSENT `companyId` key, which leaves the current link
    // alone (a JSON PATCH body can't otherwise express "clear" since
    // `undefined`-valued keys never survive the wire). Zod's `Project.companyId`
    // itself only ever accepts `string | undefined`, so a present `null` is
    // translated to an explicit-undefined override before parsing; an absent key
    // is left out of the merge entirely so the existing value survives the spread.
    const hasCompanyId = "companyId" in patch;
    // `teamId: null` is the explicit "unlink the team" signal — distinct from an
    // ABSENT `teamId` key, which leaves the current link alone (same rationale
    // as `hasCompanyId` above).
    const hasTeamId = "teamId" in patch;
    // `logo: null` is the explicit "clear the logo" signal (Phase 113, parity
    // with agents/pipelines' `avatar: null`) — distinct from an absent `logo`
    // key, which leaves the current value alone.
    const hasLogo = "logo" in patch;
    const { companyId, teamId, logo, ...rest } = patch;
    const merged = ProjectSchema.parse({
      ...existing,
      ...rest,
      ...(hasCompanyId ? { companyId: companyId === null ? undefined : companyId } : {}),
      ...(hasTeamId ? { teamId: teamId === null ? undefined : teamId } : {}),
      ...(hasLogo ? { logo: logo === null ? undefined : logo } : {}),
      id: existing.id,
    });
    await this.writeAtomic(projects.map((p) => (p.id === id ? merged : p)));
    return merged;
  }

  async delete(id: string): Promise<void> {
    const projects = await this.list();
    if (!projects.some((p) => p.id === id)) {
      throw new ProjectNotFoundError(id);
    }
    await this.writeAtomic(projects.filter((p) => p.id !== id));
    // The manifest entry is gone; drop any logo asset it owned too (Phase 113).
    await this.logoAssets.remove(id);
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(projects: Project[]): Promise<void> {
    await ensureDir(this.dir);
    // `hasSecrets` is computed at read time from the separate secrets store — never
    // persist it on the registry entity (mirrors integrations' `hasCredentials`).
    const persisted = await Promise.all(
      projects.map(async (project) => {
        const disk = await this.toDiskProject(project);
        const copy = { ...disk };
        delete copy.hasSecrets;
        return copy;
      }),
    );
    await writeFileAtomic(this.file, `${JSON.stringify(persisted, null, 2)}\n`);
  }

  /**
   * Build the on-disk form of `project`: if `logo` is an uploaded `data:image/`
   * URI, externalize it to `assets/<id>.<ext>` and swap the persisted value to
   * that bare reference; otherwise (a `/`-rooted bundled path, or none) leave it
   * untouched, and drop any stale asset the write is replacing (a clear or a
   * switch to a bundled logo). The entity returned to the *caller* of `create`/
   * `update` always keeps the full data URI — only this disk copy differs
   * (Phase 113, mirrors the agents/pipelines `AvatarAssetStore` pattern).
   */
  private async toDiskProject(project: Project): Promise<Project> {
    if (typeof project.logo === "string") {
      const ref = await this.logoAssets.externalize(project.id, project.logo);
      if (ref !== null) return { ...project, logo: ref };
    }
    // Not a data URI (bundled `/`-path) or no logo at all — tolerant no-op if
    // there was nothing to clean up.
    await this.logoAssets.remove(project.id);
    return project;
  }

  /**
   * Before validating a raw manifest entry, inline any externalized
   * `assets/<id>.<ext>` logo reference (Phase 113) back to the full
   * `data:image/*` URI `AvatarSchema` expects — the bare ref is on-disk-only
   * shorthand and would otherwise fail validation and silently drop the whole
   * project from the list. A gone/unreadable asset file omits `logo` entirely
   * (the UI falls back to the glyph) rather than surfacing a broken reference.
   */
  private inlineLogoRef(entry: unknown): unknown {
    if (typeof entry !== "object" || entry === null) return entry;
    const record = entry as Record<string, unknown>;
    if (typeof record.logo !== "string" || !this.logoAssets.isAssetRef(record.logo)) {
      return entry;
    }
    const inlined = this.logoAssets.inlineSync(record.logo);
    if (inlined === null) {
      const rest = { ...record };
      delete rest.logo;
      return rest;
    }
    return { ...record, logo: inlined };
  }

  /**
   * Phase 113 migration: on startup, externalize any pre-existing inline
   * `data:` logo left in the *raw* manifest (read directly, bypassing
   * `ProjectSchema`, so an already-externalized `assets/...` ref isn't mistaken
   * for one still needing migration and a schema-invalid entry doesn't abort
   * the whole sweep). Idempotent and tolerant — a single unreadable/corrupt
   * entry is logged and skipped, never fatal to boot.
   */
  private async sweepInlineLogos(): Promise<void> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return;
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return;

    let changed = false;
    const next = await Promise.all(
      parsed.map(async (entry) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const record = entry as Record<string, unknown>;
        const { id, logo } = record;
        if (typeof id !== "string" || typeof logo !== "string" || !logo.startsWith("data:")) {
          return entry;
        }
        try {
          const ref = await this.logoAssets.externalize(id, logo);
          if (ref === null) return entry;
          changed = true;
          return { ...record, logo: ref };
        } catch (error) {
          this.logger.warn(`Skipping inline-logo sweep for project "${id}": ${String(error)}`);
          return entry;
        }
      }),
    );
    if (!changed) return;
    await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
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
