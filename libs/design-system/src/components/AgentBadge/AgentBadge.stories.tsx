import type { Meta, StoryObj } from "@storybook/react";
import { AgentBadge } from "./AgentBadge";

const meta: Meta<typeof AgentBadge> = {
  title: "DesignSystem/AgentBadge",
  component: AgentBadge,
  parameters: { backgrounds: { default: "velin" } },
  args: { glyph: "code", color: "#5b8def", label: "Frontend developer", state: "working" },
};
export default meta;

type Story = StoryObj<typeof AgentBadge>;

export const Default: Story = {};

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <AgentBadge pulse color="#5b8def" glyph="atom" label="Frontend developer" state="working" />
      <AgentBadge color="#f472b6" glyph="spark" label="Illustrator" state="done" />
      <AgentBadge color="#56c4d6" glyph="lock" label="Security auditor" state="blocked" />
      <AgentBadge label="Unknown agent" />
    </div>
  ),
};
