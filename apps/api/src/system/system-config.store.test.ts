import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SystemConfigStore } from "./system-config.store"

describe("SystemConfigStore", () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "system-config-"))
    file = path.join(dir, "system-config.json")
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("reads schema defaults when the file is missing", () => {
    const store = new SystemConfigStore(file)
    expect(store.current()).toMatchObject({
      taskTickMs: 30_000,
      channelTickMs: 30_000,
      automationTickMs: 0,
      limitResumeTickMs: 60_000,
      limitResumeMax: 3,
      goalVerifyTimeoutMs: 600_000,
      goalAutoResume: false,
    })
  })

  it("reads a persisted file synchronously at construction", async () => {
    await fs.writeFile(file, JSON.stringify({ taskTickMs: 0, goalAutoResume: true }))
    const store = new SystemConfigStore(file)
    expect(store.current().taskTickMs).toBe(0)
    expect(store.current().goalAutoResume).toBe(true)
    // Unspecified keys fall back to schema defaults.
    expect(store.current().limitResumeMax).toBe(3)
  })

  it("falls back to defaults on a garbage file", async () => {
    await fs.writeFile(file, "{ not json")
    const store = new SystemConfigStore(file)
    expect(store.current().taskTickMs).toBe(30_000)
  })

  it("write persists atomically, updates the in-memory copy and notifies subscribers", async () => {
    const store = new SystemConfigStore(file)
    const seen = vi.fn()
    const unsubscribe = store.onChange(seen)

    const next = { ...store.current(), taskTickMs: 5_000, goalAutoResume: true }
    await store.write(next)

    expect(store.current().taskTickMs).toBe(5_000)
    expect(store.current().goalAutoResume).toBe(true)
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ taskTickMs: 5_000 }))

    // A fresh store reads the same persisted value.
    expect(new SystemConfigStore(file).current().taskTickMs).toBe(5_000)

    unsubscribe()
    await store.write({ ...store.current(), taskTickMs: 9_000 })
    expect(seen).toHaveBeenCalledTimes(1) // not called after unsubscribe
  })
})
