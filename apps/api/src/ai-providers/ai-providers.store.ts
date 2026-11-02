import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { AiProvidersStatus } from "@zibby/contracts";
import { ensureDir, isErrnoException, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the gitignored directory holding global AI provider keys. */
export const AI_PROVIDERS_DIR = "AI_PROVIDERS_DIR";

/**
 * Global AI provider keys: `<dir>/openai.json` = `{ "apiKey": "..." }`. Write-only
 * over HTTP (status exposes only the last 4 chars) and never logged — this store
 * does no logging at all.
 */
@Injectable()
export class AiProvidersStore {
  private readonly dir: string;

  constructor(@Inject(AI_PROVIDERS_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  private get openaiFile(): string {
    return path.join(this.dir, "openai.json");
  }

  /** The stored OpenAI key, or null if absent / malformed. */
  async readOpenAiKey(): Promise<string | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.openaiFile, "utf8");
    } catch {
      return null;
    }
    const parsed = safeJson(raw) as { apiKey?: unknown } | null;
    return typeof parsed?.apiKey === "string" && parsed.apiKey ? parsed.apiKey : null;
  }

  async writeOpenAiKey(apiKey: string): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.openaiFile, JSON.stringify({ apiKey }));
    await fs.chmod(this.openaiFile, 0o600); // owner-only: it is a secret
  }

  /** Idempotent — a missing file is fine. */
  async clearOpenAiKey(): Promise<void> {
    try {
      await fs.unlink(this.openaiFile);
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return;
      throw error;
    }
  }

  async status(): Promise<AiProvidersStatus> {
    const key = await this.readOpenAiKey();
    return {
      openai: key ? { configured: true, keyHint: `…${key.slice(-4)}` } : { configured: false },
    };
  }

  /** Env vars every workflow stage receives (lowest precedence: project env/secrets override). */
  async env(): Promise<Record<string, string>> {
    const key = await this.readOpenAiKey();
    return key ? { OPENAI_API_KEY: key } : {};
  }
}
