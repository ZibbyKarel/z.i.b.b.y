import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateTeamInput,
  type Team,
  TeamSchema,
  type UpdateTeamInput,
} from "@zibby/contracts";
import { ensureDir, safeJson, searchByText, writeFileAtomic } from "../shared/file-storage";
import { TeamConflictError, TeamNotFoundError } from "./teams.errors";

/** DI token carrying the absolute path of the directory that holds the registry. */
export const TEAMS_DIR = "TEAMS_DIR";

/** Manifest file holding the team registry. */
const MANIFEST_FILE = "_teams.json";

/**
 * File-backed persistence for the team registry: a single JSON manifest
 * (`_teams.json`) in a configurable data directory — mirrors
 * `CompaniesStorageService` verbatim, minus the person-roster backfill (a
 * team has no `people` roster in v1). A fresh install starts empty; the
 * manifest is created on the first `create`. The list is kept sorted by id so
 * callers get a stable order. Deleting a team that still has projects
 * pointing at it via `teamId` is allowed (no cascade) — the dangling
 * reference is resolved to "no team" at read time (mirrors the companies
 * Phase 69/70 decision).
 */
@Injectable()
export class TeamsStorageService {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(TEAMS_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
  }

  async list(): Promise<Team[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop entries that no longer match the schema rather than failing the whole
    // listing (mirrors how the entity/category listings skip corrupt records).
    return parsed
      .flatMap((entry) => {
        const result = TeamSchema.safeParse(entry);
        return result.success ? [result.data] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Team> {
    const team = (await this.list()).find((t) => t.id === id);
    if (!team) throw new TeamNotFoundError(id);
    return team;
  }

  /** Free-text search over the registry by id, name and desc. */
  async search(query: string): Promise<Team[]> {
    return searchByText(await this.list(), query, (t) => [t.id, t.name, t.desc]);
  }

  async create(input: CreateTeamInput): Promise<Team> {
    const teams = await this.list();
    if (teams.some((t) => t.id === input.id)) {
      throw new TeamConflictError(input.id);
    }
    const team = TeamSchema.parse(input);
    await this.writeAtomic([...teams, team]);
    return team;
  }

  async update(id: string, patch: UpdateTeamInput): Promise<Team> {
    const teams = await this.list();
    const existing = teams.find((t) => t.id === id);
    if (!existing) throw new TeamNotFoundError(id);
    // `companyId: null` is the explicit "unlink the company" signal — distinct
    // from an ABSENT `companyId` key, which leaves the current link alone (a
    // JSON PATCH body can't otherwise express "clear" since `undefined`-valued
    // keys never survive the wire). Zod's `Team.companyId` itself only ever
    // accepts `string | undefined`, so a present `null` is translated to an
    // explicit-undefined override before parsing; an absent key is left out of
    // the merge entirely so the existing value survives the spread.
    const hasCompanyId = "companyId" in patch;
    // `knowledgeBase: null` is the explicit "clear the knowledge base" signal —
    // distinct from an ABSENT `knowledgeBase` key, which leaves the current
    // value alone (same rationale as `hasCompanyId` above).
    const hasKnowledgeBase = "knowledgeBase" in patch;
    const { companyId, knowledgeBase, ...rest } = patch;
    const merged = TeamSchema.parse({
      ...existing,
      ...rest,
      ...(hasCompanyId ? { companyId: companyId === null ? undefined : companyId } : {}),
      ...(hasKnowledgeBase
        ? { knowledgeBase: knowledgeBase === null ? undefined : knowledgeBase }
        : {}),
      id: existing.id,
    });
    await this.writeAtomic(teams.map((t) => (t.id === id ? merged : t)));
    return merged;
  }

  async delete(id: string): Promise<void> {
    const teams = await this.list();
    if (!teams.some((t) => t.id === id)) {
      throw new TeamNotFoundError(id);
    }
    await this.writeAtomic(teams.filter((t) => t.id !== id));
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(teams: Team[]): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(teams, null, 2)}\n`);
  }
}
