import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { DEFAULT_MANDATE, type Mandate, MandateSchema } from "@zibby/contracts"
import { safeJson, writeFileAtomic } from "../shared/file-storage"

/** DI token for the mandate file path (a single JSON doc at the data root). */
export const MANDATE_FILE = "MANDATE_FILE"

/**
 * The autonomy mandate: one operator-owned `mandate.json` at the data root (like
 * POLICY.md). Tolerant read — a missing or malformed file falls back to the
 * conservative {@link DEFAULT_MANDATE} (dispatch on, reply off), and the file is
 * seeded on first boot. Only the operator's PUT writes it; nothing inbound can.
 */
@Injectable()
export class MandateStorageService implements OnModuleInit {
  private readonly file: string

  constructor(@Inject(MANDATE_FILE) file: string) {
    this.file = path.resolve(file)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    if (!(await this.exists())) await this.write(DEFAULT_MANDATE)
  }

  /** The current mandate, defaulting to the conservative floor if absent/broken. */
  async read(): Promise<Mandate> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null)
    if (raw === null) return DEFAULT_MANDATE
    const parsed = MandateSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : DEFAULT_MANDATE
  }

  /** Persist a validated mandate (atomic). */
  async write(mandate: Mandate): Promise<Mandate> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await writeFileAtomic(this.file, JSON.stringify(mandate, null, 2))
    return mandate
  }

  private exists(): Promise<boolean> {
    return fs
      .access(this.file)
      .then(() => true)
      .catch(() => false)
  }
}
