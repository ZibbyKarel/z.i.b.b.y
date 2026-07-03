import { Injectable } from "@nestjs/common";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { Attachment } from "@zibby/contracts";
import { dataDir } from "../shared/data-dir";

interface UploadedFile { originalname: string; size: number; mimetype?: string; buffer: Buffer }

@Injectable()
export class AttachmentStorageService {
  private root(): string { return dataDir("tasks", "attachments"); }

  newSetId(): string { return `set_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`; }

  dir(setId: string): string { return path.join(this.root(), path.basename(setId)); }

  async save(files: UploadedFile[]): Promise<{ attachmentSetId: string; files: Attachment[] }> {
    const attachmentSetId = this.newSetId();
    const dir = this.dir(attachmentSetId);
    await fs.mkdir(dir, { recursive: true });
    const metas: Attachment[] = [];
    for (const f of files) {
      const name = path.basename(f.originalname);
      await fs.writeFile(path.join(dir, name), f.buffer);
      metas.push({ name, size: f.size, ...(f.mimetype ? { mediaType: f.mimetype } : {}) });
    }
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(metas), "utf8");
    return { attachmentSetId, files: metas };
  }

  async list(setId: string): Promise<Attachment[]> {
    const raw = await fs.readFile(path.join(this.dir(setId), "meta.json"), "utf8").catch(() => null);
    return raw ? (JSON.parse(raw) as Attachment[]) : [];
  }

  async remove(setId: string): Promise<void> {
    await fs.rm(this.dir(setId), { recursive: true, force: true });
  }

  async listSetIds(): Promise<{ id: string; mtimeMs: number }[]> {
    const entries = await fs.readdir(this.root(), { withFileTypes: true }).catch(() => []);
    const out: { id: string; mtimeMs: number }[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const stat = await fs.stat(path.join(this.root(), e.name)).catch(() => null);
      if (stat) out.push({ id: e.name, mtimeMs: stat.mtimeMs });
    }
    return out;
  }
}
