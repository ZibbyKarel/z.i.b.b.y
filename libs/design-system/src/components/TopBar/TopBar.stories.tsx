import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { AgentSdkCredit, ClaudeLimits, ContextName } from "../../domain";
import { TopBar } from "./TopBar";

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
  byAgent: [["Kodér", "work", 31]],
  byPipeline: [["Build Feature", "work", 38]],
  byContext: [
    ["work", 57],
    ["home", 15],
  ],
  trend: [4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15],
};

const meta: Meta<typeof TopBar> = {
  title: "Dashboard/TopBar",
  component: TopBar,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  render: () => {
    const [ctx, setCtx] = useState<ContextName>("home");
    return (
      <TopBar
        context={ctx}
        onContextChange={setCtx}
        breadcrumb="Přehled"
        limits={limits}
        credit={credit}
      />
    );
  },
};
