import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AgentConflictError,
  AgentNotFoundError,
  CorruptAgentFileError,
  InvalidAgentIdError,
} from "./agents.errors"
import { AgentsStorageService } from "./agents.storage.service"

const sampleInput = {
  id: "code-reviewer",
  name: "Code Reviewer",
  description: "Reviews pull requests",
  instructions: "Be thorough and kind.",
}

describe("AgentsStorageService", () => {
  let dir: string
  let service: AgentsStorageService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-test-"))
    service = new AgentsStorageService(dir)
    await service.onModuleInit()
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  describe("create", () => {
    it("writes a file and returns an entity with createdAt/updatedAt", async () => {
      const agent = await service.create(sampleInput)

      expect(agent.id).toBe(sampleInput.id)
      expect(agent.name).toBe(sampleInput.name)
      expect(agent.createdAt).toEqual(expect.any(String))
      expect(agent.updatedAt).toBe(agent.createdAt)

      const onDisk = JSON.parse(await fs.readFile(path.join(dir, "code-reviewer.json"), "utf8"))
      expect(onDisk).toEqual(agent)
    })

    it("rejects creating an agent with an existing id (conflict)", async () => {
      await service.create(sampleInput)
      await expect(service.create(sampleInput)).rejects.toBeInstanceOf(AgentConflictError)
    })

    it("omits description when not provided", async () => {
      const agent = await service.create({
        id: "minimal",
        name: "Minimal",
        instructions: "Do the minimum.",
      })
      expect(agent.description).toBeUndefined()
    })
  })

  describe("get", () => {
    it("reads back a stored agent", async () => {
      const created = await service.create(sampleInput)
      expect(await service.get(created.id)).toEqual(created)
    })

    it("throws not-found for a missing agent", async () => {
      await expect(service.get("nope")).rejects.toBeInstanceOf(AgentNotFoundError)
    })

    it("throws (does not crash) on corrupt JSON", async () => {
      await fs.writeFile(path.join(dir, "broken.json"), "{ not valid json", "utf8")
      await expect(service.get("broken")).rejects.toBeInstanceOf(CorruptAgentFileError)
    })

    it("throws (does not crash) on structurally invalid JSON", async () => {
      await fs.writeFile(path.join(dir, "wrong.json"), JSON.stringify({ id: "wrong" }), "utf8")
      await expect(service.get("wrong")).rejects.toBeInstanceOf(CorruptAgentFileError)
    })
  })

  describe("list", () => {
    it("returns all valid agents sorted by createdAt", async () => {
      await service.create({ ...sampleInput, id: "a" })
      await service.create({ ...sampleInput, id: "b" })

      const ids = (await service.list()).map((a) => a.id)
      expect(ids).toEqual(["a", "b"])
    })

    it("skips corrupt files instead of failing", async () => {
      await service.create({ ...sampleInput, id: "good" })
      await fs.writeFile(path.join(dir, "bad.json"), "not json", "utf8")

      const ids = (await service.list()).map((a) => a.id)
      expect(ids).toEqual(["good"])
    })
  })

  describe("update", () => {
    it("merges fields, bumps updatedAt, keeps createdAt", async () => {
      const created = await service.create(sampleInput)
      await new Promise((r) => setTimeout(r, 5))

      const updated = await service.update(created.id, { name: "Renamed" })

      expect(updated.name).toBe("Renamed")
      expect(updated.instructions).toBe(created.instructions)
      expect(updated.createdAt).toBe(created.createdAt)
      expect(updated.updatedAt).not.toBe(created.updatedAt)
      expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.createdAt))

      // persisted, not just returned
      expect((await service.get(created.id)).name).toBe("Renamed")
    })

    it("throws not-found when updating a missing agent", async () => {
      await expect(service.update("ghost", { name: "x" })).rejects.toBeInstanceOf(
        AgentNotFoundError,
      )
    })
  })

  describe("delete", () => {
    it("removes the file", async () => {
      const created = await service.create(sampleInput)
      await service.delete(created.id)

      await expect(
        fs.access(path.join(dir, "code-reviewer.json")),
      ).rejects.toBeTruthy()
      await expect(service.get(created.id)).rejects.toBeInstanceOf(AgentNotFoundError)
    })

    it("throws not-found when deleting a missing agent", async () => {
      await expect(service.delete("ghost")).rejects.toBeInstanceOf(AgentNotFoundError)
    })
  })

  describe("path traversal protection", () => {
    const evilIds = ["../../evil", "foo/bar", "..", "a/../b", "/etc/passwd", ".", ""]

    it("refuses unsafe ids on create and writes nothing outside the data dir", async () => {
      for (const id of evilIds) {
        await expect(
          service.create({ id, name: "n", instructions: "i" }),
        ).rejects.toBeInstanceOf(InvalidAgentIdError)
      }
      // Only the data dir itself exists; nothing leaked above it.
      const parent = path.dirname(dir)
      const siblings = await fs.readdir(parent)
      expect(siblings).toContain(path.basename(dir))
      expect(siblings).not.toContain("evil")
      expect(siblings).not.toContain("evil.json")
    })

    it("refuses unsafe ids on get/update/delete", async () => {
      for (const id of evilIds) {
        await expect(service.get(id)).rejects.toBeInstanceOf(InvalidAgentIdError)
        await expect(service.update(id, { name: "x" })).rejects.toBeInstanceOf(
          InvalidAgentIdError,
        )
        await expect(service.delete(id)).rejects.toBeInstanceOf(InvalidAgentIdError)
      }
    })

    it("does not read a real file that lives outside the data dir via traversal", async () => {
      // Plant a file in the parent dir; a traversal id must not reach it.
      const secret = path.join(path.dirname(dir), "secret.json")
      await fs.writeFile(
        secret,
        JSON.stringify({
          id: "secret",
          name: "secret",
          instructions: "secret",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        "utf8",
      )
      try {
        await expect(service.get("../secret")).rejects.toBeInstanceOf(InvalidAgentIdError)
      } finally {
        await fs.rm(secret, { force: true })
      }
    })
  })
})
