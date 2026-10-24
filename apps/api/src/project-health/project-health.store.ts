import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type ProjectHealthQuery,
  type ProjectHealthStatus,
  ProjectHealthStatusSchema,
} from "@zibby/contracts";
import { ensureDir, resolveSafeFile, safeJson, writeFileAtomic } from "../shared/file-storage";

export const PROJECT_HEALTH_DIR = "PROJECT_HEALTH_DIR";

export class InvalidProjectHealthIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid project id: "${id}"`);
    this.name = "InvalidProjectHealthIdError";
  }
}

/**
 * File-backed project health (TODO 11) — one `<projectId>.json` per monitored
 * project, OVERWRITTEN on every check (state, not history; the N4b CI-status
 * sidecar posture). Writes are atomic (tmp + rename). The project id is checked
 * against the project id pattern ({@link AGENT_ID_REGEX}, what `ProjectIdSchema`
 * reuses) plus a containment check before any path join.
 */
@Injectable()
export class ProjectHealthStore {
  private readonly dir: string;

  constructor(@Inject(PROJECT_HEALTH_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  /** The last status for `projectId`, or null (none yet / garbage / invalid id). */
  async read(projectId: string): Promise<ProjectHealthStatus | null> {
    const file = this.fileFor(projectId);
    if (!file) return null;
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;
    const parsed = ProjectHealthStatusSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }

  /** Every stored status (garbage skipped), sorted by project id, optionally filtered. */
  async list(query: ProjectHealthQuery = {}): Promise<ProjectHealthStatus[]> {
    const names = await fs.readdir(this.dir).catch(() => [] as string[]);
    const statuses: ProjectHealthStatus[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const status = await this.read(name.slice(0, -".json".length));
      if (status) statuses.push(status);
    }
    return statuses
      .filter((s) => !query.projectId || s.projectId === query.projectId)
      .sort((a, b) => a.projectId.localeCompare(b.projectId));
  }

  /** Overwrite the project's status (validated, atomic). */
  async write(status: ProjectHealthStatus): Promise<ProjectHealthStatus> {
    const file = this.requireFile(status.projectId);
    const validated = ProjectHealthStatusSchema.parse(status);
    await ensureDir(this.dir);
    await writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    return validated;
  }

  /** Remove the project's status; a missing file is a no-op. */
  async delete(projectId: string): Promise<void> {
    await fs.rm(this.requireFile(projectId), { force: true });
  }

  private fileFor(projectId: string): string | null {
    return resolveSafeFile(this.dir, projectId, ".json", AGENT_ID_REGEX);
  }

  private requireFile(projectId: string): string {
    const file = this.fileFor(projectId);
    if (!file) throw new InvalidProjectHealthIdError(projectId);
    return file;
  }
}
