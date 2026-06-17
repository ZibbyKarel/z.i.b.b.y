import { describe, expect, it, vi } from "vitest"
import type { ActivityEntry, Project, ProjectStandup } from "@zibby/contracts"
import { ProjectNotFoundError } from "./projects.errors"
import { StandupService } from "./standup.service"

const project: Project = { id: "alpha", name: "Alpha", path: "/work/alpha" }

function entry(
  kind: ActivityEntry["kind"],
  summary: string,
  projectId?: string,
): ActivityEntry {
  return {
    id: `${kind}-1`,
    at: "2026-06-17T09:00:00.000Z",
    kind,
    summary,
    refs: projectId ? { projectId } : {},
  }
}

function makeService(
  opts: {
    project?: Project | null
    entries?: ActivityEntry[]
  } = {},
) {
  const projects = {
    get: vi.fn(async (id: string) => {
      const p = opts.project ?? project
      if (!p || p.id !== id) throw new Error("not found")
      return p
    }),
  }
  const activity = {
    readSince: vi.fn(async () => opts.entries ?? []),
  }
  const vault = {
    appendDaily: vi.fn(async () => ({}) as never),
  }
  return new StandupService(projects as never, activity as never, vault as never)
}

describe("StandupService", () => {
  it("throws ProjectNotFoundError for unknown project", async () => {
    const svc = makeService({ project: null })
    await expect(svc.generate("missing")).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it("returns a standup with all three sections", async () => {
    const entries: ActivityEntry[] = [
      entry("task-outcome", "fixed login bug"),
      entry("run-started", "running deploy pipeline"),
      entry("approval-requested", "PR needs review"),
    ]
    const svc = makeService({ entries })
    const standup = await svc.generate("alpha", new Date("2026-06-17T09:00:00.000Z"))
    expect(standup.projectId).toBe("alpha")
    expect(standup.date).toBe("2026-06-17")
    expect(standup.text).toContain("## Standup — Alpha — 2026-06-17")
    expect(standup.text).toContain("fixed login bug")
    expect(standup.text).toContain("running deploy pipeline")
    expect(standup.text).toContain("PR needs review")
  })

  it("shows empty-section messages when no activity in that bucket", async () => {
    const svc = makeService({ entries: [] })
    const standup = await svc.generate("alpha")
    expect(standup.text).toContain("No completed activity")
    expect(standup.text).toContain("No in-progress activity")
    expect(standup.text).toContain("Nothing blocked")
  })

  it("filters entries to the project — excludes other-project entries", async () => {
    const entries: ActivityEntry[] = [
      entry("task-outcome", "alpha work", "alpha"),
      entry("task-outcome", "beta work", "beta"),
      entry("run-started", "global work"), // no projectId → included
    ]
    const svc = makeService({ entries })
    const standup = await svc.generate("alpha")
    expect(standup.text).toContain("alpha work")
    expect(standup.text).toContain("global work")
    expect(standup.text).not.toContain("beta work")
  })

  it("get() returns cached result on second call without regenerating", async () => {
    const svc = makeService({ entries: [] })
    const first = await svc.get("alpha")
    const second = await svc.get("alpha")
    expect(second).toBe(first) // same object reference — from cache
  })

  it("generates and caches on first get()", async () => {
    const svc = makeService({ entries: [] })
    const result = await svc.get("alpha")
    expect(result).toBeDefined()
    const hit = svc["cache"].get("alpha") as ProjectStandup | undefined
    expect(hit).toBeDefined()
  })
})
