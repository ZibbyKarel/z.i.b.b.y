import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { AiProvidersStatus, SetBlueCodeInput } from "@zibby/contracts";
import { ensureDir, isErrnoException, safeJson, writeFileAtomic } from "../shared/file-storage";
import {
  BLUECODE_FILE,
  BLUECODE_PROBE_FILE,
  BlueCodeModelsSchema,
  providerPart,
  readBlueCode,
} from "./bluecode-provider";

/** DI token for the gitignored directory holding global AI provider keys. */
export const AI_PROVIDERS_DIR = "AI_PROVIDERS_DIR";

/** A BlueCode save the gateway refused or could not serve; the message is shown to the operator. */
export class BlueCodeError extends Error {}

const GATEWAY_TIMEOUT_MS = 10_000;

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
    await writeFileAtomic(this.openaiFile, JSON.stringify({ apiKey }), 0o600); // owner-only: a secret
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
    const bluecode = readBlueCode(this.dir);
    return {
      openai: key ? { configured: true, keyHint: `…${key.slice(-4)}` } : { configured: false },
      bluecode: bluecode
        ? {
            configured: true,
            keyHint: `…${bluecode.apiKey.slice(-4)}`,
            baseUrl: bluecode.baseUrl,
            modelCount: Object.keys(bluecode.models).length,
          }
        : { configured: false },
    };
  }

  /**
   * Verify the key against `<baseUrl>/models`, snapshot the gateway's model catalog from
   * `<baseUrl minus /v1>/.well-known/opencode`, and persist `bluecode.json` plus the
   * provider-only probe config (both 0600, written once here). No `apiKey` = keep the
   * stored one (a model-list refresh) — only for the same base URL, so a stored key is
   * never sent to a new host. Never logs the key.
   */
  async writeBlueCode(input: SetBlueCodeInput): Promise<void> {
    const stored = readBlueCode(this.dir);
    const { baseUrl } = input;
    if (!input.apiKey && stored && stored.baseUrl !== baseUrl)
      throw new BlueCodeError("Re-enter the API key to change the base URL.");
    const apiKey = input.apiKey ?? stored?.apiKey;
    if (!apiKey) throw new BlueCodeError("No BlueCode key stored yet — enter the API key.");
    let auth: Response;
    let well: Response;
    try {
      [auth, well] = await Promise.all([
        fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
          redirect: "error",
        }),
        fetch(`${baseUrl.replace(/\/v1$/, "")}/.well-known/opencode`, {
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
          redirect: "error",
        }),
      ]);
    } catch {
      throw new BlueCodeError("Could not reach the BlueCode gateway — check the base URL.");
    }
    if (!auth.ok) throw new BlueCodeError(`BlueCode rejected the key (HTTP ${auth.status}).`);
    const models = await this.readModels(well);
    await ensureDir(this.dir);
    const file = path.join(this.dir, BLUECODE_FILE);
    const next = { baseUrl, apiKey, models };
    // Probe first: without bluecode.json it is ignored, so a failed second write can't
    // leave a stale probe next to a new config.
    await writeFileAtomic(
      path.join(this.dir, BLUECODE_PROBE_FILE),
      JSON.stringify(providerPart(next)),
      0o600,
    );
    await writeFileAtomic(file, JSON.stringify(next), 0o600);
  }

  private async readModels(res: Response): Promise<Record<string, Record<string, unknown>>> {
    const unreadable = new BlueCodeError("The BlueCode model list could not be read.");
    if (!res.ok) throw unreadable;
    const body = (await res.json().catch(() => null)) as {
      config?: { provider?: Record<string, { models?: unknown }> };
    } | null;
    const providers = Object.values(body?.config?.provider ?? {});
    const parsed = BlueCodeModelsSchema.safeParse(providers[0]?.models);
    if (providers.length !== 1 || !parsed.success || !Object.keys(parsed.data).length)
      throw unreadable;
    return parsed.data;
  }

  /** Idempotent — a missing file is fine. */
  async clearBlueCode(): Promise<void> {
    for (const name of [BLUECODE_FILE, BLUECODE_PROBE_FILE]) {
      try {
        await fs.unlink(path.join(this.dir, name));
      } catch (error) {
        if (!(isErrnoException(error) && error.code === "ENOENT")) throw error;
      }
    }
  }

  /** Env vars every workflow stage receives (lowest precedence: project env/secrets override). */
  async env(): Promise<Record<string, string>> {
    const key = await this.readOpenAiKey();
    return key ? { OPENAI_API_KEY: key } : {};
  }
}
