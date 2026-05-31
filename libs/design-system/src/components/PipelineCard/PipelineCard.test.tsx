import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { AgentDef, Pipeline } from "../../domain"
import { PipelineCard } from "./PipelineCard"

const agents: AgentDef[] = [
  { id: "architect", name: "Architekt", glyph: "compass", role: "", model: "opus", thinking: "high", tools: [], ctx: "work", state: "idle", file: "" },
]

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  ctx: "work",
  budget: 25,
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "f",
  phases: [{ agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" }],
}

describe("PipelineCard", () => {
  it("renders name, state label and budget", () => {
    render(<PipelineCard pipeline={pipeline} agents={agents} selected={false} onSelect={() => {}} />)
    expect(screen.getByText("Build Feature")).toBeInTheDocument()
    expect(screen.getByText("zaparkováno")).toBeInTheDocument()
    expect(screen.getByText(/strop \$25/)).toBeInTheDocument()
  })

  it("selects on click", async () => {
    const onSelect = vi.fn()
    render(<PipelineCard pipeline={pipeline} agents={agents} selected={false} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole("button"))
    expect(onSelect).toHaveBeenCalledWith("build-feature")
  })
})
