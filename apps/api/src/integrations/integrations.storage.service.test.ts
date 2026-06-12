import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { CreateIntegrationInput } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  IntegrationsStorageService,
  InvalidIntegrationIdError,
} from "./integrations.storage.service"

const sample: CreateIntegrationInput = {
  id: "team-slack",
  kind: "slack",
  name: "Team Slack",
  config: { kind: "slack", channels: ["C1"] },
}
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`)

describe("IntegrationsStorageService", () => {
  let dir: string
  let service: IntegrationsStorageService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "integrations-test-"))
    service = new IntegrationsStorageService(dir)
    await service.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("persists with defaulted status/enabled and never writes hasCredentials", async () => {
    const created = await service.create(sample)
    expect(created.status).toBe("disconnected")
    expect(created.enabled).toBe(true)
    const onDisk = JSON.parse(await fs.readFile(fileFor(dir, "team-slack"), "utf8"))
    expect(onDisk).not.toHaveProperty("hasCredentials")
    expect((await service.get("team-slack")).hasCredentials).toBe(false)
  })

  it("rejects a duplicate id", async () => {
    await service.create(sample)
    await expect(service.create(sample)).rejects.toBeInstanceOf(IntegrationConflictError)
  })

  it("404s on a missing integration", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(IntegrationNotFoundError)
  })

  it("stamps connection health via markSync (and clears lastError on success)", async () => {
    await service.create(sample)
    const errored = await service.markSync("team-slack", { status: "error", lastError: "boom" })
    expect(errored.status).toBe("error")
    expect(errored.lastError).toBe("boom")
    const ok = await service.markSync("team-slack", {
      status: "connected",
      lastSyncAt: "2026-06-12T00:00:00.000Z",
      lastError: undefined,
    })
    expect(ok.status).toBe("connected")
    expect(ok.lastError).toBeUndefined()
    expect(ok.lastSyncAt).toBe("2026-06-12T00:00:00.000Z")
  })

  it("keeps kind immutable on update", async () => {
    await service.create(sample)
    const updated = await service.update("team-slack", {
      enabled: false,
      config: { kind: "slack", channels: ["C1", "C2"] },
    })
    expect(updated.kind).toBe("slack")
    expect(updated.enabled).toBe(false)
  })

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ ...sample, id })).rejects.toBeInstanceOf(InvalidIntegrationIdError)
    }
  })
})
