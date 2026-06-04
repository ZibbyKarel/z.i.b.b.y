import { describe, expect, it } from "vitest"
import { SkillRunSchema, SkillSchema, skillRunsContract, skillsContract } from "../index"

describe("skillsContract", () => {
  it("exposes CRUD under /api/skills", () => {
    expect(skillsContract.createSkill.method).toBe("POST")
    expect(skillsContract.createSkill.path).toBe("/api/skills")
    expect(skillsContract.listSkills.path).toBe("/api/skills")
    expect(skillsContract.getSkill.path).toBe("/api/skills/:id")
  })
})

describe("skillRunsContract", () => {
  it("keeps run routes in the /api/skills/* space", () => {
    expect(skillRunsContract.startSkillRun.path).toBe("/api/skills/:id/run")
    expect(skillRunsContract.listRunningSkills.path).toBe("/api/skills/running")
    expect(skillRunsContract.getSkillRunLogs.path).toBe("/api/skills/runs/:runId/logs")
  })
})

describe("skill schema", () => {
  it("requires id + instructions and accepts free-form glyph/desc", () => {
    expect(
      SkillSchema.safeParse({ id: "summarize", glyph: "spark", desc: "TL;DR", instructions: "do it" })
        .success,
    ).toBe(true)
  })

  it("rejects an id with a path separator or a blank instructions body", () => {
    expect(SkillSchema.safeParse({ id: "a/b", instructions: "x" }).success).toBe(false)
    expect(SkillSchema.safeParse({ id: "ok", instructions: "" }).success).toBe(false)
  })
})

describe("skill run schema", () => {
  it("carries a skillId and a run status", () => {
    const parsed = SkillRunSchema.safeParse({
      runId: "summarize_1_2",
      skillId: "summarize",
      status: "running",
      pct: 0,
      prompt: "p",
      project: "",
      cwd: "/tmp/x",
      startedAt: new Date().toISOString(),
      pid: 2,
      logFile: "/tmp/x.log",
    })
    expect(parsed.success).toBe(true)
  })
})
