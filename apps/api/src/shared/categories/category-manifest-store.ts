import { promises as fs } from "node:fs"
import * as path from "node:path"
import { type Category, CategorySchema, type CreateCategoryInput } from "@zibby/contracts"
import { ensureDir, safeJson, writeFileAtomic } from "../file-storage"

/** Manifest file holding a category taxonomy, alongside its resource's data files. */
export const CATEGORY_MANIFEST_FILE = "_categories.json"

/** Raised when creating a category whose name is already taken. */
export class CategoryConflictError extends Error {
  constructor(public readonly name: string) {
    super(`Category "${name}" already exists`)
    this.name = "CategoryConflictError"
  }
}

/** Raised when a category to delete does not exist in the manifest. */
export class CategoryNotFoundError extends Error {
  constructor(public readonly name: string) {
    super(`Category "${name}" not found`)
    this.name = "CategoryNotFoundError"
  }
}

/**
 * File-backed persistence for a category taxonomy: a single JSON manifest
 * (`_categories.json`) in a resource's data directory. Storing the list
 * separately from the entities it groups lets a category exist with zero members
 * (the "Add category" flow creates one before anything is filed under it) and
 * keeps the entity files flat — an entity links to a category only by its
 * `category` string, so re-categorising never moves a file. A fresh install
 * starts with an empty taxonomy; the manifest is created on the first `create`.
 *
 * Shared base used by the skills and projects category stores (each injected with
 * its own data dir). The agents catalog keeps its own historical copy.
 */
export abstract class CategoryManifestStore {
  protected readonly dir: string
  protected readonly file: string

  protected constructor(dir: string) {
    this.dir = path.resolve(dir)
    this.file = path.join(this.dir, CATEGORY_MANIFEST_FILE)
  }

  async list(): Promise<Category[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null)
    if (raw === null) return []
    // A hand-corrupted manifest reads as empty rather than crashing the API.
    const parsed = safeJson(raw)
    if (!Array.isArray(parsed)) return []
    // Drop any entry that no longer matches the schema instead of failing the
    // whole listing (mirrors how the entity listings skip corrupt files).
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
