import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AgentDef, Pipeline } from "../../domain"
import { PhaseChain } from "./PhaseChain"

const agents: AgentDef[] = [
  { id: "architect", name: "Architekt", glyph: "compass", role: "", model: "opus", thinking: "high", tools: [], ctx: "work", state: "idle", file: "" },
  { id: "coder", name: "Kodér", glyph: "code", role: "", model: "sonnet", thinking: "medium", tools: [], ctx: "work", state: "idle", file: "" },
  { id: "tester", name: "Tester", glyph: "flask", role: "", model: "sonnet", thinking: "medium", tools: [], ctx: "work", state: "idle", file: "" },
]

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  ctx: "work",
  budget: 25,
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "~/zibby/pipelines/build-feature.pipeline.md",
  phases: [
    { agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" },
    { agent: "Kodér", consumes: "design.md", produces: "branch feat/*", model: "sonnet", thinking: "medium" },
    {
      agent: "Tester",
      consumes: "branch",
      produces: "test-report.md",
      model: "sonnet",
      thinking: "medium",
      loop: { to: "Kodér", maxRetries: 3, escalate: true, then: "park_for_review" },
    },
  ],
}

describe("PhaseChain", () => {
  it("renders every phase", () => {
    render(<PhaseChain pipeline={pipeline} agents={agents} />)
    expect(screen.getByText("Architekt")).toBeInTheDocument()
    expect(screen.getByText("Kodér")).toBeInTheDocument()
    expect(screen.getByText("Tester")).toBeInTheDocument()
  })

  it("renders the retry loop and decision nodes when a phase loops", () => {
    render(<PhaseChain pipeline={pipeline} agents={agents} />)
    expect(screen.getByText(/retry · max 3 · ↑ thinking/)).toBeInTheDocument()
    expect(screen.getByText("testy prošly")).toBeInTheDocument()
    expect(screen.getByText("testy selhaly")).toBeInTheDocument()
  })
})
