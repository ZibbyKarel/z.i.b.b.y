import { describe, expect, it } from "vitest"
import type { PipelineRun } from "@zibby/contracts"
import { renderProgress } from "./progress"

const PHASES = ["architekt", "koder", "review", "verify", "dokumentator"]

function run(over: Partial<PipelineRun>): PipelineRun {
  return {
    pipelineRunId: "delivery_1",
    pipelineId: "delivery",
    status: "running",
    currentStage: "koder",
    stageRuns: [],
    startedAt: "2026-06-13T05:00:00.000Z",
    cwd: "/tmp/d1",
    ...over,
  } as PipelineRun
}

describe("renderProgress", () => {
  it("derives Done / In progress / Next from stageRuns + checkpoints + cursor", () => {
    const md = renderProgress(
      run({
        currentStage: "koder",
        stageRuns: [{ phaseId: "architekt", runId: "r1", attempt: 1, status: "done" }],
        checkpoints: [{ phaseId: "architekt", sha: "abc1234", at: "2026-06-13T05:01:00.000Z" }],
      }),
      PHASES,
    )
    expect(md).toContain("- [x] architekt (checkpoint abc1234)")
    expect(md).toContain("- [ ] koder (running)")
    // Next = the phases after the cursor, unchecked.
    expect(md).toContain("- [ ] review")
    expect(md).toContain("- [ ] verify")
    expect(md).toContain("- [ ] dokumentator")
    // koder is in progress, not yet in Done.
    expect(md).not.toContain("- [x] koder")
  })

  it("a finished run has no in-progress / next", () => {
    const md = renderProgress(
      run({
        status: "done",
        currentStage: null,
        stageRuns: PHASES.map((id) => ({ phaseId: id, runId: id, attempt: 1, status: "done" as const })),
      }),
      PHASES,
    )
    for (const id of PHASES) expect(md).toContain(`- [x] ${id}`)
    expect(md).toContain("## In progress\n- _none_")
    expect(md).toContain("## Next\n- _none_")
  })

  it("is round-trip stable (render → render identical for the same inputs)", () => {
    const r = run({
      stageRuns: [{ phaseId: "architekt", runId: "r1", attempt: 1, status: "done" }],
      checkpoints: [{ phaseId: "architekt", sha: "abc1234", at: "2026-06-13T05:01:00.000Z" }],
    })
    expect(renderProgress(r, PHASES)).toBe(renderProgress(r, PHASES))
  })

  it("an empty run lists nothing done and everything next", () => {
    const md = renderProgress(run({ currentStage: "architekt", stageRuns: [] }), PHASES)
    expect(md).toContain("## Done\n- _nothing yet_")
  })
})
