import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjectSecretsStore } from "./project-secrets.store"

describe("ProjectSecretsStore", () => {
  let dir: string
  let store: ProjectSecretsStore

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-secrets-test-"))
    store = new ProjectSecretsStore(dir)
    await store.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("writes, detects and reads secrets back", async () => {
    expect(await store.has("proj")).toBe(false)
    await store.write("proj", { DB_URL: "postgres://x", API_KEY: "k" })
    expect(await store.has("proj")).toBe(true)
    expect(await store.read("proj")).toEqual({ DB_URL: "postgres://x", API_KEY: "k" })
  })

  it("removes secrets (idempotent on missing)", async () => {
    await store.write("proj", { A: "1" })
    await store.remove("proj")
    expect(await store.has("proj")).toBe(false)
    await store.remove("proj") // no throw on missing
  })

  it("returns null on a malformed/absent file (tolerant read)", async () => {
    expect(await store.read("ghost")).toBeNull()
    await fs.writeFile(path.join(dir, "broken.json"), "{ not json", "utf8")
    expect(await store.read("broken")).toBeNull()
  })

  it("refuses traversal ids (no write, has=false, read=null)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(store.write(id, { A: "1" })).rejects.toThrow()
      expect(await store.has(id)).toBe(false)
      expect(await store.read(id)).toBeNull()
    }
    const entries = await fs.readdir(dir)
    expect(entries).toEqual([])
  })
})
