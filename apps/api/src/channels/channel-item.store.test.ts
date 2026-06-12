import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { ChannelItem } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ChannelItemStore } from "./channel-item.store"

const item = (overrides: Partial<ChannelItem> = {}): ChannelItem => ({
  id: "C1-100",
  integrationId: "team-slack",
  kind: "slack",
  externalRef: { channel: "C1", ts: "100" },
  receivedAt: "2026-06-12T00:00:00.000Z",
  text: "hello",
  raw: {},
  state: "new",
  ...overrides,
})

describe("ChannelItemStore", () => {
  let dir: string
  let store: ChannelItemStore

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "channels-test-"))
    store = new ChannelItemStore(dir)
    await store.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("persists two-level and reads back", async () => {
    await store.put(item())
    const onDisk = path.join(dir, "team-slack", "C1-100.json")
    expect(JSON.parse(await fs.readFile(onDisk, "utf8")).id).toBe("C1-100")
    expect((await store.get("team-slack", "C1-100"))?.text).toBe("hello")
  })

  it("dedups on a second put (returns the existing item, no overwrite)", async () => {
    await store.put(item({ text: "first" }))
    const second = await store.put(item({ text: "second" }))
    expect(second.text).toBe("first")
    expect((await store.get("team-slack", "C1-100"))?.text).toBe("first")
  })

  it("update overwrites in place (state transition)", async () => {
    await store.put(item())
    await store.update(item({ state: "handled", taskId: "task_1" }))
    const got = await store.get("team-slack", "C1-100")
    expect(got?.state).toBe("handled")
    expect(got?.taskId).toBe("task_1")
  })

  it("filters list by integrationId and state", async () => {
    await store.put(item({ id: "C1-100", state: "new" }))
    await store.put(item({ id: "C1-200", state: "handled" }))
    await store.put(item({ id: "C1-300", integrationId: "other", state: "new" }))
    expect((await store.list({ state: "new" })).map((i) => i.id).sort()).toEqual(["C1-100", "C1-300"])
    expect((await store.list({ integrationId: "team-slack" })).length).toBe(2)
  })

  it("finds an item by id across integration dirs", async () => {
    await store.put(item({ id: "C1-100", integrationId: "team-slack" }))
    const found = await store.findById("C1-100")
    expect(found?.integrationId).toBe("team-slack")
    expect(await store.findById("missing")).toBeNull()
  })

  it("round-trips the per-integration cursor", async () => {
    expect(await store.readCursor("team-slack")).toBeUndefined()
    await store.writeCursor("team-slack", "1700.5")
    expect(await store.readCursor("team-slack")).toBe("1700.5")
  })

  it("refuses traversal in BOTH the integration id and the item id", async () => {
    // Unsafe integration id.
    await expect(store.put(item({ integrationId: "../escape" }))).rejects.toThrow()
    // Unsafe item id under a valid integration.
    await expect(store.put(item({ id: "../../escape" }))).rejects.toThrow()
    // Nothing escaped the root.
    const entries = await fs.readdir(dir)
    expect(entries).toEqual([])
  })
})
