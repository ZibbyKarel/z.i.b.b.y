import { describe, expect, it, vi } from "vitest"
import type { AgentRun, PipelineRun } from "@zibby/contracts"
import { ActivityRecorderService } from "./activity-recorder.service"

/** A fake runner that lets a test drive its onRunStatus listener directly. */
function makeRunner<T>() {
  let listener: ((run: T) => void) | undefined
  return {
    onRunStatus: (l: (run: T) => void) => {
      listener = l
      return () => {
        listener = undefined
      }
    },
    emit: (run: T) => listener?.(run),
  }
}

const agentRun = (status: AgentRun["status"]): AgentRun =>
  ({ runId: "a1", agentId: "writer", status, title: "T" }) as AgentRun

const pipelineRun = (status: PipelineRun["status"], parkedReason?: string): PipelineRun =>
  ({ pipelineRunId: "p1", pipelineId: "release", status, parkedReason }) as PipelineRun

describe("ActivityRecorderService", () => {
  function setup() {
    const agent = makeRunner<AgentRun>()
    const pipeline = makeRunner<PipelineRun>()
    const record = vi.fn().mockResolvedValue(undefined)
    const service = new ActivityRecorderService(
      agent as never,
      pipeline as never,
      { record } as never,
    )
    service.onModuleInit()
    return { agent, pipeline, record, service }
  }

  it("records run-started then run-finished for an agent run", () => {
    const { agent, record } = setup()
    agent.emit(agentRun("running"))
    agent.emit(agentRun("done"))
    const kinds = record.mock.calls.map((c) => c[0].kind)
    expect(kinds).toEqual(["run-started", "run-finished"])
  })

  it("dedups a repeated status — one entry per transition", () => {
    const { agent, record } = setup()
    agent.emit(agentRun("running"))
    agent.emit(agentRun("running"))
    agent.emit(agentRun("done"))
    agent.emit(agentRun("done"))
    expect(record.mock.calls.map((c) => c[0].kind)).toEqual(["run-started", "run-finished"])
  })

  it("maps pipeline running → parked → finished", () => {
    const { pipeline, record } = setup()
    pipeline.emit(pipelineRun("running"))
    pipeline.emit(pipelineRun("parked", "retries"))
    pipeline.emit(pipelineRun("done"))
    expect(record.mock.calls.map((c) => c[0].kind)).toEqual([
      "pipeline-started",
      "pipeline-parked",
      "pipeline-finished",
    ])
    // The parked entry carries the run ref + status for traceability.
    const parked = record.mock.calls[1]![0]
    expect(parked.refs).toMatchObject({ runRef: "p1", status: "parked" })
  })

  it("ignores non-transition statuses (e.g. awaiting-approval)", () => {
    const { agent, record } = setup()
    agent.emit(agentRun("awaiting-approval"))
    expect(record).not.toHaveBeenCalled()
  })
})
