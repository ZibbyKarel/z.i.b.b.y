import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CredentialsStore } from "./credentials.store"

describe("CredentialsStore", () => {
  let dir: string
  let store: CredentialsStore

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "credentials-test-"))
    store = new CredentialsStore(dir)
    await store.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("writes, detects and reads a secret back", async () => {
    expect(await store.has("team-slack")).toBe(false)
    await store.write("team-slack", { token: "xoxb-1" })
    expect(await store.has("team-slack")).toBe(true)
    expect(await store.read("team-slack")).toEqual({ token: "xoxb-1" })
  })

  it("removes a secret (idempotent on missing)", async () => {
    await store.write("team-slack", { token: "xoxb-1" })
    await store.remove("team-slack")
    expect(await store.has("team-slack")).toBe(false)
    await store.remove("team-slack") // no throw on missing
  })

  it("returns null on a malformed/absent file (tolerant read)", async () => {
    expect(await store.read("ghost")).toBeNull()
    await fs.writeFile(path.join(dir, "broken.json"), "{ not json", "utf8")
    expect(await store.read("broken")).toBeNull()
  })

  it("refuses traversal ids (no write, has=false, read=null)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(store.write(id, { token: "x" })).rejects.toThrow()
      expect(await store.has(id)).toBe(false)
      expect(await store.read(id)).toBeNull()
    }
    // No file escaped the dir.
    const entries = await fs.readdir(dir)
    expect(entries).toEqual([])
  })
})
