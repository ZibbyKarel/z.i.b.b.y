import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { AGENT_ID_REGEX, type ProjectSecretsInput } from "@zibby/contracts"
import {
  ensureDir,
  fileExists,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage"

/** DI token for the gitignored directory holding per-project run secrets. */
export const PROJECT_SECRETS_DIR = "PROJECT_SECRETS_DIR"

/**
 * The per-project secret store, kept deliberately separate from the committed
 * project registry: one `<projectId>.json` under a gitignored directory. Secrets
 * are write-only over HTTP (the API exposes only `hasSecrets`) and are NEVER
 * logged — this store does no logging at all, so a token can't leak through a
 * debug line. Same flat-dir containment (`resolveSafeFile` + the agent id regex)
 * and crash-safe atomic write as the integrations credentials store.
 */
@Injectable()
export class ProjectSecretsStore implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(PROJECT_SECRETS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir)
  }

  private resolve(projectId: string): string | null {
    return resolveSafeFile(this.dir, projectId, ".json", AGENT_ID_REGEX)
  }

  /** True if a secrets file exists for the project (the only thing read back over HTTP). */
  async has(projectId: string): Promise<boolean> {
    const file = this.resolve(projectId)
    if (file === null) return false
    return fileExists(file)
  }

  /** Read the stored secrets, or null if absent / unreadable / malformed. */
  async read(projectId: string): Promise<ProjectSecretsInput | null> {
    const file = this.resolve(projectId)
    if (file === null) return null
    let raw: string
    try {
      raw = await fs.readFile(file, "utf8")
    } catch {
      return null
    }
    const parsed = safeJson(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as ProjectSecretsInput
  }

  /** Persist the project's secrets (atomic). Overwrites any prior value. */
  async write(projectId: string, secrets: ProjectSecretsInput): Promise<void> {
    const file = this.resolve(projectId)
    if (file === null) throw new Error(`Invalid project id: "${projectId}"`)
    await ensureDir(this.dir)
    await writeFileAtomic(file, JSON.stringify(secrets))
  }

  /** Remove the project's secrets if present (idempotent — missing is fine). */
  async remove(projectId: string): Promise<void> {
    const file = this.resolve(projectId)
    if (file === null) return
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return
      throw error
    }
  }
}
