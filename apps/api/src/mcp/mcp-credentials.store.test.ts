import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { McpCredentialsStore } from "./mcp-credentials.store"

describe("McpCredentialsStore", () => {
  let dir: string
  let store: McpCredentialsStore

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-credentials-test-"))
    store = new McpCredentialsStore(dir)
    await store.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("writes, detects and reads a secret back", async () => {
    expect(await store.has("fs")).toBe(false)
    await store.write("fs", { env: { TOKEN: "s3cr3t" } })
    expect(await store.has("fs")).toBe(true)
    expect(await store.read("fs")).toEqual({ env: { TOKEN: "s3cr3t" } })
  })

  it("removes a secret (idempotent on missing)", async () => {
    await store.write("fs", { authToken: "abc" })
    await store.remove("fs")
    expect(await store.has("fs")).toBe(false)
    await store.remove("fs") // no throw on missing
  })

  it("returns null on a malformed/absent file (tolerant read)", async () => {
    expect(await store.read("ghost")).toBeNull()
    await fs.writeFile(path.join(dir, "broken.json"), "{ not json", "utf8")
    expect(await store.read("broken")).toBeNull()
  })

  it("refuses traversal ids (no write, has=false, read=null)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(store.write(id, { authToken: "x" })).rejects.toThrow()
      expect(await store.has(id)).toBe(false)
      expect(await store.read(id)).toBeNull()
    }
    const entries = await fs.readdir(dir)
    expect(entries).toEqual([])
  })
})
