import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreateHookInput,
  type Hook,
  HookSchema,
  type UpdateHookInput,
} from "@zibby/contracts"
import { EntityFileStore, safeJson } from "../shared/file-storage"
import { HookConflictError, HookNotFoundError, InvalidHookIdError } from "./hooks.errors"

/** DI token carrying the absolute path of the directory that holds hook files. */
export const HOOKS_DIR = "HOOKS_DIR"

/**
 * Durable, file-backed persistence for custom hooks — one `<id>.json` each. A
 * hook is structured config with no Markdown body, so it follows the JSON store
 * pattern (like integrations), not the Markdown one. There is intentionally no
 * database. The runner reads the enabled set and merges it into every run's
 * `--settings`; the locked approval hook always wins (Law 1).
 */
@Injectable()
export class HooksStorageService extends EntityFileStore<Hook> implements OnModuleInit {
  protected readonly fileExt = ".json"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(HOOKS_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreateHookInput): Promise<Hook> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) throw new HookConflictError(input.id)
    const hook = HookSchema.parse({ ...input })
    await this.writeEntity(hook)
    return hook
  }

  async update(id: string, patch: UpdateHookInput): Promise<Hook> {
    const existing = await this.get(id)
    // Identity is immutable; everything else is a partial overwrite.
    const merged: Hook = { ...existing, ...patch, id: existing.id }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(hook: Hook): string {
    return hook.id
  }

  protected serialize(hook: Hook): string {
    return JSON.stringify(hook)
  }

  protected tryParse(raw: string): Hook | null {
    const parsed = HookSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : null
  }

  protected compare(a: Hook, b: Hook): number {
    return a.id.localeCompare(b.id)
  }

  protected notFound(id: string): Error {
    return new HookNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidHookIdError(id)
  }
}
