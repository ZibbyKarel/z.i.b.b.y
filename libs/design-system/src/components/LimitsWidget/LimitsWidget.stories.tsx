import type { Meta, StoryObj } from "@storybook/react";
import type { AgentSdkCredit, ClaudeLimits } from "../../domain";
import { LimitsWidget } from "./LimitsWidget";

const limits: ClaudeLimits = {
  rolling: {
    label: "5h rolling",
    short: "5h",
    usedPct: 64,
    resetIn: "2h 11m",
    tokens: "128k / 200k",
  },
  weekly: {
    label: "Týdenní",
    short: "týden",
    usedPct: 38,
    resetIn: "Po 09:00",
    tokens: "1.9M / 5M",
  },
};

const credit: AgentSdkCredit = {
  label: "Agent SDK kredit",
  total: 200,
  used: 72,
  remaining: 128,
  usedPct: 36,
  renew: "1. čer",
  byAgent: [
    ["Kodér", "work", 31],
    ["Architekt", "work", 16],
    ["Tester", "work", 11],
    ["tmdb-renamer", "home", 6],
  ],
  byPipeline: [
    ["Build Feature", "work", 38],
    ["Nightly Research", "work", 19],
    ["Media tidy", "home", 8],
  ],
  byContext: [
    ["work", 57],
    ["home", 15],
  ],
  trend: [4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15],
};

const meta: Meta<typeof LimitsWidget> = {
  title: "Dashboard/LimitsWidget",
  component: LimitsWidget,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="flex justify-end p-6">
        <Story />
      </div>
    ),
  ],
  args: { limits, credit },
};
export default meta;

type Story = StoryObj<typeof LimitsWidget>;

export const Default: Story = {};
