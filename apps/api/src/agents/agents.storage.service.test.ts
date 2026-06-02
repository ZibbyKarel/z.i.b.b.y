import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import matter from "gray-matter"
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
  description: "Reviews pull requests",
  instructions: "Be thorough and kind.",
}

const fileFor = (dir: string, id: string) => path.join(dir, `${id}.md`)

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
    it("writes a .md file with frontmatter + instructions body", async () => {
      const agent = await service.create(sampleInput)

      expect(agent).toEqual({
        id: "code-reviewer",
        // `name` defaults to the id and is mirrored into the frontmatter.
        name: "code-reviewer",
        description: "Reviews pull requests",
        instructions: "Be thorough and kind.",
      })

      const raw = await fs.readFile(fileFor(dir, "code-reviewer"), "utf8")
      const parsed = matter(raw)
      // id is the file name and is mirrored into the frontmatter `name`.
      expect(parsed.data.name).toBe("code-reviewer")
      expect(parsed.data.description).toBe("Reviews pull requests")
      expect(parsed.content.trim()).toBe("Be thorough and kind.")
    })

    it("rejects creating an agent with an existing id (conflict)", async () => {
      await service.create(sampleInput)
      await expect(service.create(sampleInput)).rejects.toBeInstanceOf(AgentConflictError)
    })

    it("omits description from frontmatter when not provided", async () => {
      const agent = await service.create({
        id: "minimal",
        instructions: "Do the minimum.",
      })
      expect(agent.description).toBeUndefined()

      const parsed = matter(await fs.readFile(fileFor(dir, "minimal"), "utf8"))
      expect(parsed.data).not.toHaveProperty("description")
    })

    it("round-trips the structured dashboard config through the frontmatter", async () => {
      const input = {
        id: "stylist",
        name: "Stylist",
        description: "Edits Czech copy",
        glyph: "feather",
        model: "opus" as const,
        thinking: "high" as const,
        tools: ["read", "write"],
        category: "writing",
        instructions: "Polish the prose.",
      }
      const created = await service.create(input)
      expect(created).toEqual(input)
      // persisted and parsed back identically
      expect(await service.get("stylist")).toEqual(input)
    })

    it("drops a single out-of-range field instead of discarding the agent", async () => {
      // A hand-edited file with a bogus model must not vanish from the catalog.
      await fs.writeFile(
        fileFor(dir, "typo"),
        matter.stringify("Do the work.\n", {
          name: "typo",
          model: "gpt-9",
          thinking: "medium",
        }),
        "utf8",
      )
      const agent = await service.get("typo")
      expect(agent.id).toBe("typo")
      expect(agent.model).toBeUndefined()
      expect(agent.thinking).toBe("medium")
    })
  })

  describe("get", () => {
    it("reads back a stored agent", async () => {
      const created = await service.create(sampleInput)
      expect(await service.get(created.id)).toEqual(created)
    })

    it("derives the id from the file name, not the frontmatter", async () => {
      // Frontmatter name disagrees with the file name; file name wins.
      await fs.writeFile(
        fileFor(dir, "real-id"),
        matter.stringify("Body here.\n", { name: "spoofed", description: "d" }),
        "utf8",
      )
      const agent = await service.get("real-id")
      expect(agent.id).toBe("real-id")
      expect(agent.instructions).toBe("Body here.")
    })

    it("throws not-found for a missing agent", async () => {
      await expect(service.get("nope")).rejects.toBeInstanceOf(AgentNotFoundError)
    })

    it("throws (does not crash) on invalid YAML frontmatter", async () => {
      await fs.writeFile(
        fileFor(dir, "broken"),
        "---\nname: [unclosed\n---\nbody",
        "utf8",
      )
      await expect(service.get("broken")).rejects.toBeInstanceOf(CorruptAgentFileError)
    })

    it("throws (does not crash) when the instructions body is empty", async () => {
      await fs.writeFile(
        fileFor(dir, "empty"),
        matter.stringify("   \n", { name: "empty" }),
        "utf8",
      )
      await expect(service.get("empty")).rejects.toBeInstanceOf(CorruptAgentFileError)
    })
  })

  describe("list", () => {
    it("returns all valid agents sorted by id", async () => {
      await service.create({ ...sampleInput, id: "b" })
      await service.create({ ...sampleInput, id: "a" })

      const ids = (await service.list()).map((a) => a.id)
      expect(ids).toEqual(["a", "b"])
    })

    it("skips corrupt files instead of failing", async () => {
      await service.create({ ...sampleInput, id: "good" })
      await fs.writeFile(fileFor(dir, "bad"), "---\nname: [oops\n---\n", "utf8")

      const ids = (await service.list()).map((a) => a.id)
      expect(ids).toEqual(["good"])
    })

    it("ignores non-markdown files", async () => {
      await service.create({ ...sampleInput, id: "good" })
      await fs.writeFile(path.join(dir, "notes.txt"), "ignore me", "utf8")

      const ids = (await service.list()).map((a) => a.id)
      expect(ids).toEqual(["good"])
    })
  })

  describe("update", () => {
    it("merges provided fields and leaves the id intact", async () => {
      const created = await service.create(sampleInput)

      const updated = await service.update(created.id, {
        instructions: "Be rigorous.",
      })

      expect(updated.id).toBe(created.id)
      expect(updated.description).toBe(created.description)
      expect(updated.instructions).toBe("Be rigorous.")

      // persisted, not just returned
      expect((await service.get(created.id)).instructions).toBe("Be rigorous.")
    })

    it("throws not-found when updating a missing agent", async () => {
      await expect(
        service.update("ghost", { instructions: "x" }),
      ).rejects.toBeInstanceOf(AgentNotFoundError)
    })
  })

  describe("delete", () => {
    it("removes the file", async () => {
      const created = await service.create(sampleInput)
      await service.delete(created.id)

      await expect(fs.access(fileFor(dir, "code-reviewer"))).rejects.toBeTruthy()
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
          service.create({ id, instructions: "i" }),
        ).rejects.toBeInstanceOf(InvalidAgentIdError)
      }
      const parent = path.dirname(dir)
      const siblings = await fs.readdir(parent)
      expect(siblings).toContain(path.basename(dir))
      expect(siblings).not.toContain("evil")
      expect(siblings).not.toContain("evil.md")
    })

    it("refuses unsafe ids on get/update/delete", async () => {
      for (const id of evilIds) {
        await expect(service.get(id)).rejects.toBeInstanceOf(InvalidAgentIdError)
        await expect(service.update(id, { instructions: "x" })).rejects.toBeInstanceOf(
          InvalidAgentIdError,
        )
        await expect(service.delete(id)).rejects.toBeInstanceOf(InvalidAgentIdError)
      }
    })

    it("does not read a real file that lives outside the data dir via traversal", async () => {
      const secret = path.join(path.dirname(dir), "secret.md")
      await fs.writeFile(secret, matter.stringify("secret body\n", { name: "secret" }), "utf8")
      try {
        await expect(service.get("../secret")).rejects.toBeInstanceOf(InvalidAgentIdError)
      } finally {
        await fs.rm(secret, { force: true })
      }
    })
  })
})
