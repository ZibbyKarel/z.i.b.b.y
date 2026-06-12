import { describe, expect, it } from "vitest"
import { buildResumeContext } from "./resume-context"

describe("buildResumeContext", () => {
  it("assembles a continuation block from progress + checkpoint log + note", () => {
    const block = buildResumeContext({
      progressMd: "# PROGRESS\n\n## Done\n- [x] architekt (checkpoint abc1234)\n",
      checkpointLog: "abc1234 zibby-checkpoint(architekt): plan",
      note: "watch the migration order",
    })
    expect(block).toContain("Resume context — continuation, not restart")
    expect(block).toContain("Do NOT re-implement completed items")
    expect(block).toContain("abc1234 zibby-checkpoint(architekt): plan")
    expect(block).toContain("[x] architekt")
    expect(block).toContain("watch the migration order")
  })

  it("carries the failure tail on a loop back-edge", () => {
    const block = buildResumeContext({
      progressMd: "## Done\n- [x] koder\n",
      failureTail: "review.md: rejected — missing null check at user.ts:42",
    })
    expect(block).toContain("What failed last attempt")
    expect(block).toContain("missing null check at user.ts:42")
  })

  it("omits empty sections and returns '' when nothing is present (never an empty fence)", () => {
    expect(buildResumeContext({})).toBe("")
    expect(buildResumeContext({ progressMd: "   ", checkpointLog: "", note: undefined })).toBe("")
    // Only a note → no checkpoint / progress / failure sections.
    const onlyNote = buildResumeContext({ note: "do X" })
    expect(onlyNote).toContain("Operator note")
    expect(onlyNote).not.toContain("Already committed")
    expect(onlyNote).not.toContain("What failed")
    expect(onlyNote).not.toContain("```\n```")
  })
})
