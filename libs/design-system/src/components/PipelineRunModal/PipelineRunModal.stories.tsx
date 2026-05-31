import type { Meta, StoryObj } from "@storybook/react";
import type { AgentDef, Pipeline } from "../../domain";
import { PipelineRunModal } from "./PipelineRunModal";

const agents: AgentDef[] = [
  {
    id: "architect",
    name: "Architekt",
    glyph: "compass",
    role: "",
    model: "opus",
    thinking: "high",
    tools: [],
    ctx: "work",
    state: "idle",
    file: "",
  },
  {
    id: "coder",
    name: "Kodér",
    glyph: "code",
    role: "",
    model: "sonnet",
    thinking: "medium",
    tools: [],
    ctx: "work",
    state: "idle",
    file: "",
  },
  {
    id: "tester",
    name: "Tester",
    glyph: "flask",
    role: "",
    model: "sonnet",
    thinking: "medium",
    tools: [],
    ctx: "work",
    state: "idle",
    file: "",
  },
  {
    id: "doc",
    name: "Dokumentátor",
    glyph: "doc",
    role: "",
    model: "sonnet",
    thinking: "low",
    tools: [],
    ctx: "work",
    state: "idle",
    file: "",
  },
];

const pipeline: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  ctx: "work",
  budget: 25,
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "Spec → implementace → testy → docs.",
  file: "~/zibby/pipelines/build-feature.pipeline.md",
  phases: [
    {
      agent: "Architekt",
      consumes: "task.md",
      produces: "design.md",
      model: "opus",
      thinking: "high",
    },
    {
      agent: "Kodér",
      consumes: "design.md",
      produces: "branch",
      model: "sonnet",
      thinking: "medium",
    },
    {
      agent: "Tester",
      consumes: "branch",
      produces: "report.md",
      model: "sonnet",
      thinking: "medium",
    },
    {
      agent: "Dokumentátor",
      consumes: "branch",
      produces: "README.md",
      model: "sonnet",
      thinking: "low",
    },
  ],
};

const meta: Meta<typeof PipelineRunModal> = {
  title: "Dashboard/PipelineRunModal",
  component: PipelineRunModal,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-screen">
        <Story />
      </div>
    ),
  ],
  args: {
    pipeline,
    agents,
    projects: ["zibby-core", "home-ops", "media-vault"],
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof PipelineRunModal>;

export const Default: Story = {};
