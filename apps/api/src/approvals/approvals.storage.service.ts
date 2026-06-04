import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { type Approval, ApprovalSchema } from "@zibby/contracts"
import { ApprovalNotFoundError, InvalidApprovalIdError } from "./approvals.errors"

/** DI token carrying the absolute path of the directory that holds approval files. */
export const APPROVALS_DIR = "APPROVALS_DIR"

const FILE_EXT = ".json"
const ID_REGEX = /^[a-zA-Z0-9._-]+$/

/**
 * Durable, file-backed persistence for approvals: one `<id>.json` per approval in
 * a configurable directory. An approval must outlive both a polling gap and a
 * backend restart, so it is persisted the same atomic-write / tolerant-parse way
 * as run sidecars — a single corrupt file is skipped, never fatal to the list.
 */
@Injectable()
export class ApprovalsStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(APPROVALS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async create(approval: Approval): Promise<Approval> {
    await this.writeAtomic(approval)
    return approval
  }

  async get(id: string): Promise<Approval> {
    const file = this.resolveFile(id)
    const raw = await fs.readFile(file, "utf8").catch((error: unknown) => {
      if (isErrnoException(error) && error.code === "ENOENT") throw new ApprovalNotFoundError(id)
      throw error
    })
    const parsed = ApprovalSchema.safeParse(safeJson(raw))
    if (!parsed.success) throw new ApprovalNotFoundError(id)
    return parsed.data
  }

  async list(): Promise<Approval[]> {
    await fs.mkdir(this.dir, { recursive: true })
    const entries = await fs.readdir(this.dir).catch(() => [] as string[])
    const out: Approval[] = []
    for (const entry of entries) {
      if (!entry.endsWith(FILE_EXT)) continue
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = ApprovalSchema.safeParse(safeJson(raw))
      if (parsed.success) out.push(parsed.data)
    }
    return out.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
  }

  async update(approval: Approval): Promise<Approval> {
    await this.writeAtomic(approval)
    return approval
  }

  /** A fresh, filename-safe, collision-resistant approval id. */
  newId(prefix: string): string {
    const safe = prefix.replace(/[^a-zA-Z0-9._-]/g, "-")
    return `${safe}_${Date.now()}_${randomBytes(3).toString("hex")}`
  }

  private resolveFile(id: string): string {
    if (typeof id !== "string" || !ID_REGEX.test(id)) throw new InvalidApprovalIdError(id)
    const file = path.resolve(this.dir, `${id}${FILE_EXT}`)
    if (path.dirname(file) !== this.dir) throw new InvalidApprovalIdError(id)
    return file
  }

  private async writeAtomic(approval: Approval): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const file = this.resolveFile(approval.id)
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, JSON.stringify(approval), "utf8")
    try {
      await fs.rename(tmp, file)
    } catch (error) {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
