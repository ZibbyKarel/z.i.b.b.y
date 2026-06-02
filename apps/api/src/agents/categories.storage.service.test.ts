import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CategoryConflictError, CategoryNotFoundError } from "./categories.errors"
import { CategoriesStorageService } from "./categories.storage.service"

const MANIFEST = "_categories.json"

describe("CategoriesStorageService", () => {
  let dir: string
  let service: CategoriesStorageService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "categories-test-"))
    service = new CategoriesStorageService(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("starts with an empty taxonomy when no manifest exists", async () => {
    expect(await service.list()).toEqual([])
  })

  it("appends a new category", async () => {
    const created = await service.create({ name: "Finance", glyph: "dollar" })
    expect(created).toEqual({ name: "Finance", glyph: "dollar" })
    expect(await service.list()).toContainEqual({ name: "Finance", glyph: "dollar" })
  })

  it("rejects a duplicate name (conflict)", async () => {
    await service.create({ name: "Finance", glyph: "dollar" })
    await expect(service.create({ name: "Finance", glyph: "cart" })).rejects.toBeInstanceOf(
      CategoryConflictError,
    )
  })

  it("deletes an existing category", async () => {
    await service.create({ name: "Finance", glyph: "dollar" })
    await service.delete("Finance")
    expect((await service.list()).some((c) => c.name === "Finance")).toBe(false)
  })

  it("throws when deleting a category that does not exist", async () => {
    await expect(service.delete("Ghost")).rejects.toBeInstanceOf(CategoryNotFoundError)
  })

  it("drops corrupt entries and a broken manifest instead of crashing", async () => {
    await fs.writeFile(
      path.join(dir, MANIFEST),
      JSON.stringify([{ name: "Good", glyph: "code" }, { name: "", glyph: "x" }, 42]),
    )
    expect(await service.list()).toEqual([{ name: "Good", glyph: "code" }])

    await fs.writeFile(path.join(dir, MANIFEST), "{ not json")
    expect(await service.list()).toEqual([])
  })
})
