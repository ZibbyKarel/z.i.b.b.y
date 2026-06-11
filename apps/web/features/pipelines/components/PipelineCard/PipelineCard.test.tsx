import { renderWithProviders as render, screen } from "../../../../test/render"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Agent } from "@zibby/contracts"
import type { Pipeline } from "../../../../domain"
import { PipelineCard } from "./PipelineCard"

const agents: Agent[] = [
  { id: "architect", name: "Architekt", glyph: "compass", model: "opus", thinking: "high", tools: [], instructions: "x" },
]

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "f",
  phases: [{ agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" }],
}

describe("PipelineCard", () => {
  it("renders name, state label and last run", () => {
    render(<PipelineCard agents={agents} onSelect={() => {}} pipeline={pipeline} selected={false} />)
    expect(screen.getByText("Build Feature")).toBeInTheDocument()
    expect(screen.getByText("zaparkováno")).toBeInTheDocument()
    expect(screen.getByText(/dnes 03:12/)).toBeInTheDocument()
  })

  it("selects on click", async () => {
    const onSelect = vi.fn()
    render(<PipelineCard agents={agents} onSelect={onSelect} pipeline={pipeline} selected={false} />)
    await userEvent.click(screen.getByRole("button"))
    expect(onSelect).toHaveBeenCalledWith("build-feature")
  })
})
