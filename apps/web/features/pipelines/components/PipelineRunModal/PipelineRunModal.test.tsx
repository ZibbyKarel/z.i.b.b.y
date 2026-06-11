import { renderWithProviders as render, screen } from "../../../../test/render"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Agent } from "@zibby/contracts"
import type { Pipeline } from "../../../../domain"
import { PipelineRunModal } from "./PipelineRunModal"

const agents: Agent[] = [
  { id: "architect", name: "Architekt", glyph: "compass", model: "opus", thinking: "high", tools: [], instructions: "x" },
  { id: "coder", name: "Kodér", glyph: "code", model: "sonnet", thinking: "medium", tools: [], instructions: "x" },
]

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  lastRun: "dnes",
  lastState: "parked",
  desc: "d",
  file: "f",
  phases: [
    { agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" },
    { agent: "Kodér", consumes: "design.md", produces: "branch", model: "sonnet", thinking: "medium" },
  ],
}

const projects = ["zibby-core", "home-ops"]

describe("PipelineRunModal", () => {
  it("renders a labelled dialog with per-agent overrides", () => {
    render(
      <PipelineRunModal agents={agents} onClose={() => {}} pipeline={pipeline} projects={projects} />,
    )
    expect(
      screen.getByRole("dialog", { name: "Spustit pipeline Build Feature" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Změnit model pro Architekt")).toBeInTheDocument()
  })

  it("launches with the chosen project and overrides", async () => {
    const onLaunch = vi.fn()
    render(
      <PipelineRunModal
        agents={agents}
        onClose={() => {}}
        onLaunch={onLaunch}
        pipeline={pipeline}
        projects={projects}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Spustit pipeline$/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ project: "zibby-core" }),
    )
    expect(screen.getByText("Pipeline spuštěna na pozadí")).toBeInTheDocument()
  })
})
