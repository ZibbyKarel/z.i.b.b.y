import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import type { AgentDef, Pipeline } from "../../domain"
import { PipelineCard } from "./PipelineCard"

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
  desc: "Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.",
  file: "~/zibby/pipelines/build-feature.pipeline.md",
  phases: [
    { agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" },
    { agent: "Kodér", consumes: "design.md", produces: "branch", model: "sonnet", thinking: "medium" },
    { agent: "Tester", consumes: "branch", produces: "report.md", model: "sonnet", thinking: "medium" },
  ],
}

const meta: Meta<typeof PipelineCard> = {
  title: "Velín/PipelineCard",
  component: PipelineCard,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-80"><Story /></div>],
}
export default meta

type Story = StoryObj<typeof PipelineCard>

export const Default: Story = {
  render: () => {
    const [sel, setSel] = useState(false)
    return (
      <PipelineCard
        pipeline={pipeline}
        agents={agents}
        selected={sel}
        onSelect={() => setSel((v) => !v)}
      />
    )
  },
}
