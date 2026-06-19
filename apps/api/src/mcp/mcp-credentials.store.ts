import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { AGENT_ID_REGEX, type McpCredentialsInput } from "@zibby/contracts";
import {
  ensureDir,
  fileExists,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage";

/** DI token for the gitignored directory holding per-MCP-server secrets. */
export const MCP_CREDENTIALS_DIR = "MCP_CREDENTIALS_DIR";

/**
 * The MCP secret store, kept deliberately separate from the committed server
 * entity: one `<serverId>.json` under a gitignored directory. Secrets are
 * write-only over HTTP (the API exposes only `hasCredentials`) and are NEVER
 * logged — this store does no logging at all, so a token can't leak through a
 * debug line. Same flat-dir containment (`resolveSafeFile` + the agent id regex)
 * and crash-safe atomic write as the integrations credentials store.
 */
@Injectable()
export class McpCredentialsStore implements OnModuleInit {
  private readonly dir: string;

  constructor(@Inject(MCP_CREDENTIALS_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir);
  }

  private resolve(serverId: string): string | null {
    return resolveSafeFile(this.dir, serverId, ".json", AGENT_ID_REGEX);
  }

  /** True if a credentials file exists for the server (the only thing read back over HTTP). */
  async has(serverId: string): Promise<boolean> {
    const file = this.resolve(serverId);
    if (file === null) return false;
    return fileExists(file);
  }

  /** Read the stored credentials, or null if absent / unreadable / malformed. */
  async read(serverId: string): Promise<McpCredentialsInput | null> {
    const file = this.resolve(serverId);
    if (file === null) return null;
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      return null;
    }
    const parsed = safeJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as McpCredentialsInput;
  }

  /** Persist the server's secret (atomic). Overwrites any prior value. */
  async write(serverId: string, creds: McpCredentialsInput): Promise<void> {
    const file = this.resolve(serverId);
    if (file === null) throw new Error(`Invalid MCP server id: "${serverId}"`);
    await ensureDir(this.dir);
    await writeFileAtomic(file, JSON.stringify(creds));
  }

  /** Remove the server's secret if present (idempotent — missing is fine). */
  async remove(serverId: string): Promise<void> {
    const file = this.resolve(serverId);
    if (file === null) return;
    try {
      await fs.unlink(file);
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return;
      throw error;
    }
  }
}
