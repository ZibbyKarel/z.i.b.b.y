import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type ExternalSkillRecord, ExternalSkillRecordSchema } from "@zibby/contracts";
import { z } from "zod";
import { dataDir } from "../shared/data-dir";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

export const EXTERNAL_SKILLS_FILE = "EXTERNAL_SKILLS_FILE";
/** DI token: the root directory holding one folder per installed external skill. */
export const EXTERNAL_SKILLS_DIR = "EXTERNAL_SKILLS_DIR";

export function resolveExternalSkillsFile(): string {
  return process.env.EXTERNAL_SKILLS_FILE ?? dataDir("external-skills.json");
}

export function resolveExternalSkillsDir(): string {
  return process.env.EXTERNAL_SKILLS_DIR ?? dataDir("skills-external");
}

/** Serializes every install/update/remove of external skills and own-skill creates. */
export const EXTERNAL_SKILLS_LOCK = "external-skills";

/** The folder an external skill lives in. `id` must already match `AGENT_ID_REGEX`. */
export function externalSkillDir(id: string, root = resolveExternalSkillsDir()): string {
  return path.join(root, id);
}

const RecordsSchema = z.array(ExternalSkillRecordSchema);

/**
 * Provenance records of installed external skills, `data/external-skills.json`.
 * Same shape as `MarketplacesStore`: re-read on every call (so every instance
 * sees the others' writes), a missing/corrupt file reads as empty. Callers
 * serialize mutations (`withPathLock("external-skills", …)`).
 */
@Injectable()
export class ExternalSkillsStore {
  constructor(@Inject(EXTERNAL_SKILLS_FILE) private readonly file: string) {}

  async list(): Promise<ExternalSkillRecord[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    const parsed = RecordsSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : [];
  }

  async get(id: string): Promise<ExternalSkillRecord | undefined> {
    return (await this.list()).find((r) => r.id === id);
  }

  /** Insert or replace the record with the same id. */
  async upsert(record: ExternalSkillRecord): Promise<void> {
    const rest = (await this.list()).filter((r) => r.id !== record.id);
    await this.write([...rest, ExternalSkillRecordSchema.parse(record)]);
  }

  async remove(id: string): Promise<void> {
    await this.write((await this.list()).filter((r) => r.id !== id));
  }

  private async write(records: ExternalSkillRecord[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(records, null, 2)}\n`);
  }
}
