import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { CreateHookInput } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HookConflictError, HookNotFoundError, InvalidHookIdError } from "./hooks.errors"
import { HooksStorageService } from "./hooks.storage.service"

const sample: CreateHookInput = {
  id: "notify-stop",
  event: "Stop",
  command: "/usr/bin/notify run finished",
  enabled: true,
}
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`)

describe("HooksStorageService", () => {
  let dir: string
  let service: HooksStorageService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hooks-test-"))
    service = new HooksStorageService(dir)
    await service.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("persists a hook with defaulted enabled", async () => {
    const created = await service.create({
      id: "bare-hook",
      event: "Stop",
      command: "echo hi",
    } as CreateHookInput)
    expect(created.enabled).toBe(true)
    const onDisk = JSON.parse(await fs.readFile(fileFor(dir, "bare-hook"), "utf8"))
    expect(onDisk.event).toBe("Stop")
    expect(onDisk.command).toBe("echo hi")
  })

  it("rejects a duplicate id", async () => {
    await service.create(sample)
    await expect(service.create(sample)).rejects.toBeInstanceOf(HookConflictError)
  })

  it("404s on a missing hook", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(HookNotFoundError)
  })

  it("keeps the id immutable on update", async () => {
    await service.create(sample)
    const updated = await service.update("notify-stop", { enabled: false, command: "echo hi" })
    expect(updated.id).toBe("notify-stop")
    expect(updated.enabled).toBe(false)
    expect(updated.command).toBe("echo hi")
  })

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ ...sample, id })).rejects.toBeInstanceOf(InvalidHookIdError)
    }
  })
})
