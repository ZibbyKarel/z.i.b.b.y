import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DuplicateNoteError } from "../memory/vault.service"
import { BriefingService } from "./briefing.service"

/** A minimal in-memory vault double that mimics create/update collision semantics. */
function makeVault() {
  const notes = new Map<string, { body: string; frontmatter: unknown }>()
  const daily: string[] = []
  return {
    notes,
    daily,
    createNote: vi.fn(async ({ id, body, frontmatter }: { id: string; body: string; frontmatter: unknown }) => {
      if (notes.has(id)) throw new DuplicateNoteError(id)
      notes.set(id, { body, frontmatter })
      return { id }
    }),
    updateNote: vi.fn(async (id: string, { body, frontmatter }: { body: string; frontmatter: unknown }) => {
      notes.set(id, { body, frontmatter })
      return { id }
    }),
    appendDaily: vi.fn(async (text: string) => {
      daily.push(text)
      return { id: "daily" }
    }),
  }
}

describe("BriefingService", () => {
  let dir: string
  let vault: ReturnType<typeof makeVault>
  let record: ReturnType<typeof vi.fn>
  let briefer: { headline: ReturnType<typeof vi.fn> }
  let service: BriefingService

  const now = new Date("2026-06-12T07:00:00.000Z")

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-"))
    vault = makeVault()
    record = vi.fn().mockResolvedValue(undefined)
    briefer = { headline: vi.fn().mockResolvedValue(null) } // VITEST-style: fall back

    const approvals = { list: vi.fn().mockResolvedValue([]) }
    const pipelines = { listAll: vi.fn().mockResolvedValue([]) }
    const channels = { list: vi.fn().mockResolvedValue([]) }
    const activity = { readSince: vi.fn().mockResolvedValue([]), record }
    const tasks = { list: vi.fn().mockResolvedValue([]) }
    const projects = { list: vi.fn().mockResolvedValue([]) }

    service = new BriefingService(
      approvals as never,
      pipelines as never,
      channels as never,
      activity as never,
      briefer as never,
      vault as never,
      tasks as never,
      projects as never,
      dir,
      { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) } as never,
    )
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("persists a note, advances the cursor, and records the briefing", async () => {
    const { briefing, noteId } = await service.generate(now)
    expect(noteId).toBe("briefing-2026-06-12")
    expect(vault.createNote).toHaveBeenCalledTimes(1)
    expect(vault.daily[0]).toContain("[[briefing-2026-06-12]]")
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: "briefing-generated", refs: { noteId } }))

    // The cursor advanced to this briefing's generatedAt.
    const cursor = JSON.parse(await fs.readFile(path.join(dir, "last-briefing.json"), "utf8"))
    expect(cursor.generatedAt).toBe(briefing.generatedAt)
  })

  it("updates (not 409s) when today's briefing is regenerated", async () => {
    await service.generate(now)
    await service.generate(now) // same day → createNote throws Duplicate → updateNote
    expect(vault.createNote).toHaveBeenCalledTimes(2)
    expect(vault.updateNote).toHaveBeenCalledTimes(1)
  })

  it("falls back to the deterministic headline when the briefer returns null", async () => {
    const { briefing } = await service.generate(now)
    expect(briefing.headline).toBe("Nothing needs you.")
    expect(briefer.headline).toHaveBeenCalledTimes(1)
  })

  it("uses the butler-voice headline when the briefer succeeds", async () => {
    briefer.headline.mockResolvedValueOnce("All quiet — I handled the overnight bits.")
    const { briefing } = await service.generate(now)
    expect(briefing.headline).toBe("All quiet — I handled the overnight bits.")
  })

  it("since-cursor defaults to start of today on first assemble", async () => {
    const briefing = await service.assemble(now)
    expect(briefing.since).toBe("2026-06-12T00:00:00.000Z")
  })
})
