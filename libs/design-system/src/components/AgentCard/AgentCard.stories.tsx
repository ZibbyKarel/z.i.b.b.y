import type { Meta, StoryObj } from "@storybook/react";
import type { AgentDef } from "../../domain";
import { AgentCard } from "./AgentCard";

const agent: AgentDef = {
  id: "architect",
  name: "Architekt",
  glyph: "compass",
  role: "Navrhne řešení a rozepíše plán do design.md",
  model: "opus",
  thinking: "high",
  tools: ["read", "web", "write"],
  ctx: "work",
  state: "idle",
  file: "~/zibby/agents/architect.agent.md",
};

const meta: Meta<typeof AgentCard> = {
  title: "Dashboard/AgentCard",
  component: AgentCard,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  args: { agent },
};
export default meta;

type Story = StoryObj<typeof AgentCard>;

export const Default: Story = {};
