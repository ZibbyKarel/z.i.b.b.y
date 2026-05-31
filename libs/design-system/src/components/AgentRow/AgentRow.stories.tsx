import type { Meta, StoryObj } from "@storybook/react";
import type { RunningAgent } from "../../domain";
import { AgentRow } from "./AgentRow";

const agent: RunningAgent = {
  id: "a1",
  skill: "tmdb-renamer",
  ctx: "home",
  prompt: "Srovnej /media/downloads/seriály",
  state: "running",
  pct: 72,
  started: "3m",
  project: "media-vault",
};

const meta: Meta<typeof AgentRow> = {
  title: "Dashboard/AgentRow",
  component: AgentRow,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
  args: { agent },
};
export default meta;

type Story = StoryObj<typeof AgentRow>;

export const Default: Story = {};
