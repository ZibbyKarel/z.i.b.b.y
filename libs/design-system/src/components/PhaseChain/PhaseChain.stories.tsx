import type { Meta, StoryObj } from "@storybook/react";
import type { AgentDef, Pipeline } from "../../domain";
import { HudPanel } from "../HudPanel/HudPanel";
import { PhaseChain } from "./PhaseChain";

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
  desc: "Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.",
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
      produces: "branch feat/*",
      model: "sonnet",
      thinking: "medium",
    },
    {
      agent: "Tester",
      consumes: "branch",
      produces: "test-report.md",
      model: "sonnet",
      thinking: "medium",
      loop: {
        to: "Kodér",
        maxRetries: 3,
        escalate: true,
        then: "park_for_review",
      },
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

const meta: Meta<typeof PhaseChain> = {
  title: "Dashboard/PhaseChain",
  component: PhaseChain,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <HudPanel title="zřetězení fází · soubory = předání">
          <Story />
        </HudPanel>
      </div>
    ),
  ],
  args: { pipeline, agents },
};
export default meta;

type Story = StoryObj<typeof PhaseChain>;

export const Default: Story = {};
