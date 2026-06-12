import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { AGENT_ID_REGEX, type CredentialsInput } from "@zibby/contracts"
import {
  ensureDir,
  fileExists,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage"

/** DI token for the gitignored directory holding per-integration secrets. */
export const CREDENTIALS_DIR = "CREDENTIALS_DIR"

/**
 * The secret store, kept deliberately separate from the committed integration
 * entity: one `<integrationId>.json` under a gitignored directory. Secrets are
 * write-only over HTTP (the API exposes only `hasCredentials`) and are NEVER
 * logged — this store does no logging at all, so a token can't leak through a
 * debug line. Same flat-dir containment (`resolveSafeFile` + the agent id regex)
 * and crash-safe atomic write as every other file store.
 */
@Injectable()
export class CredentialsStore implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(CREDENTIALS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir)
  }

  private resolve(integrationId: string): string | null {
    return resolveSafeFile(this.dir, integrationId, ".json", AGENT_ID_REGEX)
  }

  /** True if a credentials file exists for the integration (the only thing read back over HTTP). */
  async has(integrationId: string): Promise<boolean> {
    const file = this.resolve(integrationId)
    if (file === null) return false
    return fileExists(file)
  }

  /** Read the stored credentials, or null if absent / unreadable / malformed. */
  async read(integrationId: string): Promise<CredentialsInput | null> {
    const file = this.resolve(integrationId)
    if (file === null) return null
    let raw: string
    try {
      raw = await fs.readFile(file, "utf8")
    } catch {
      return null
    }
    const parsed = safeJson(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as CredentialsInput
  }

  /** Persist the integration's secret (atomic). Overwrites any prior value. */
  async write(integrationId: string, creds: CredentialsInput): Promise<void> {
    const file = this.resolve(integrationId)
    if (file === null) throw new Error(`Invalid integration id: "${integrationId}"`)
    await ensureDir(this.dir)
    await writeFileAtomic(file, JSON.stringify(creds))
  }

  /** Remove the integration's secret if present (idempotent — missing is fine). */
  async remove(integrationId: string): Promise<void> {
    const file = this.resolve(integrationId)
    if (file === null) return
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return
      throw error
    }
  }
}
