import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { AgentDef, Pipeline } from "../../domain"
import { PipelineRunModal } from "./PipelineRunModal"

const agents: AgentDef[] = [
  { id: "architect", name: "Architekt", glyph: "compass", role: "", model: "opus", thinking: "high", tools: [], ctx: "work", state: "idle", file: "" },
  { id: "coder", name: "Kodér", glyph: "code", role: "", model: "sonnet", thinking: "medium", tools: [], ctx: "work", state: "idle", file: "" },
]

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  ctx: "work",
  budget: 25,
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
      <PipelineRunModal pipeline={pipeline} agents={agents} projects={projects} onClose={() => {}} />,
    )
    expect(
      screen.getByRole("dialog", { name: "Spustit pipeline Build Feature" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Změnit model pro Architekt")).toBeInTheDocument()
  })

  it("launches with budget and overrides", async () => {
    const onLaunch = vi.fn()
    render(
      <PipelineRunModal
        pipeline={pipeline}
        agents={agents}
        projects={projects}
        onClose={() => {}}
        onLaunch={onLaunch}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Spustit · max/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ budget: 25, project: "zibby-core" }),
    )
    expect(screen.getByText("Pipeline spuštěna na pozadí")).toBeInTheDocument()
  })
})
