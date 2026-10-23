import type { Meta, StoryObj } from "@storybook/react";
import { AgentBadge } from "./AgentBadge";

const meta: Meta<typeof AgentBadge> = {
  title: "DesignSystem/AgentBadge",
  component: AgentBadge,
  parameters: { backgrounds: { default: "velin" } },
  args: { glyph: "code", color: "#5b8def", label: "Frontend developer", state: "working" },
  argTypes: {
    state: {
      control: "select",
      options: [undefined, "thinking", "working", "blocked", "wait", "done", "error", "idle"],
    },
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg", "xl"] },
  },
};
export default meta;

type Story = StoryObj<typeof AgentBadge>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <AgentBadge pulse color="#5b8def" glyph="atom" label="Frontend developer" state="working" />
      <AgentBadge color="#a78bfa" glyph="spark" label="Architect" state="thinking" />
      <AgentBadge color="#f472b6" glyph="spark" label="Illustrator" state="done" />
      <AgentBadge pulse color="#56c4d6" glyph="lock" label="Security auditor" state="blocked" />
      <AgentBadge color="#f59e0b" glyph="code" label="Coder" state="error" />
      <AgentBadge color="#34d399" glyph="bot" label="Tester" state="idle" />
      <AgentBadge label="Unknown agent" />
      <div className="flex items-center gap-3">
        {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
          <AgentBadge color="#5b8def" glyph="atom" key={size} size={size} state="working" />
        ))}
      </div>
    </div>
  ),
};

export const Playground: Story = {};
