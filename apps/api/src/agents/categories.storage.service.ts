import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable } from "@nestjs/common"
import { type Category, CategorySchema, type CreateCategoryInput } from "@zibby/contracts"
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage"
import { CategoryConflictError, CategoryNotFoundError } from "./categories.errors"
import { AGENTS_DIR } from "./agents.storage.service"

/** Manifest file holding the category taxonomy, alongside the agent `.md` files. */
const MANIFEST_FILE = "_categories.json"

/**
 * File-backed persistence for the agent-catalog taxonomy: a single JSON manifest
 * (`_categories.json`) in the same data directory as the agent files. Storing the
 * list separately from the agents lets a category exist with zero agents (the
 * "Add category" flow creates one before any agent is filed under it) and keeps
 * agent files flat — an agent links to a category only by its frontmatter
 * `category` string, so re-categorising never moves a file. A fresh install
 * starts with an empty taxonomy; the manifest is created on the first `create`.
 */
@Injectable()
export class CategoriesStorageService {
  private readonly dir: string
  private readonly file: string

  constructor(@Inject(AGENTS_DIR) dir: string) {
    this.dir = path.resolve(dir)
    this.file = path.join(this.dir, MANIFEST_FILE)
  }

  async list(): Promise<Category[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null)
    if (raw === null) return []
    // A hand-corrupted manifest reads as empty rather than crashing the API.
    const parsed = safeJson(raw)
    if (!Array.isArray(parsed)) return []
    // Drop any entry that no longer matches the schema instead of failing the
    // whole listing (mirrors how the agent listing skips corrupt files).
    return parsed.flatMap((entry) => {
      const result = CategorySchema.safeParse(entry)
      return result.success ? [result.data] : []
    })
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const categories = await this.list()
    if (categories.some((c) => c.name === input.name)) {
      throw new CategoryConflictError(input.name)
    }
    const category: Category = { name: input.name, glyph: input.glyph }
    await this.writeAtomic([...categories, category])
    return category
  }

  /** Remove a category from the manifest. The caller enforces the "empty" policy. */
  async delete(name: string): Promise<void> {
    const categories = await this.list()
    if (!categories.some((c) => c.name === name)) {
      throw new CategoryNotFoundError(name)
    }
    await this.writeAtomic(categories.filter((c) => c.name !== name))
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(categories: Category[]): Promise<void> {
    await ensureDir(this.dir)
    await writeFileAtomic(this.file, `${JSON.stringify(categories, null, 2)}\n`)
  }
}
