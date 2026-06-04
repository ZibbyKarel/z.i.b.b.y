import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { CreateAutomationInput } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AutomationConflictError,
  AutomationNotFoundError,
  AutomationsStorageService,
  InvalidAutomationIdError,
} from "./automations.storage.service"

const sample: CreateAutomationInput = {
  id: "nightly",
  name: "Nightly digest",
  trigger: { type: "cron", expr: "0 9 * * *" },
  target: { type: "pipeline", pipelineId: "digest" },
  enabled: true,
}
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`)

describe("AutomationsStorageService", () => {
  let dir: string
  let service: AutomationsStorageService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "automations-test-"))
    service = new AutomationsStorageService(dir)
    await service.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("persists an automation as <id>.json and reads it back", async () => {
    const created = await service.create(sample)
    expect(created).toEqual(sample)
    const onDisk = JSON.parse(await fs.readFile(fileFor(dir, "nightly"), "utf8"))
    expect(onDisk.id).toBe("nightly")
    expect(await service.get("nightly")).toEqual(sample)
  })

  it("rejects creating an automation with an existing id", async () => {
    await service.create(sample)
    await expect(service.create(sample)).rejects.toBeInstanceOf(AutomationConflictError)
  })

  it("404s on get/delete of a missing automation", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(AutomationNotFoundError)
    await expect(service.delete("nope")).rejects.toBeInstanceOf(AutomationNotFoundError)
  })

  it("merges a partial patch on update without touching the id", async () => {
    await service.create(sample)
    const updated = await service.update("nightly", { enabled: false })
    expect(updated.id).toBe("nightly")
    expect(updated.enabled).toBe(false)
    expect(updated.name).toBe("Nightly digest")
  })

  it("stamps lastFiredAt via markFired", async () => {
    await service.create(sample)
    const at = "2026-06-04T09:00:00.000Z"
    const fired = await service.markFired("nightly", at)
    expect(fired.lastFiredAt).toBe(at)
    expect((await service.get("nightly")).lastFiredAt).toBe(at)
  })

  it("skips a corrupt file in list() instead of failing", async () => {
    await service.create(sample)
    await fs.writeFile(fileFor(dir, "broken"), "{ not json", "utf8")
    const list = await service.list()
    expect(list.map((a) => a.id)).toEqual(["nightly"])
  })

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(
        service.create({ ...sample, id }),
      ).rejects.toBeInstanceOf(InvalidAutomationIdError)
    }
  })
})
