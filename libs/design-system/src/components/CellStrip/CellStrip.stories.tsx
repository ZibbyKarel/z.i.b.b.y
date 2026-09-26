import type { Meta, StoryObj } from "@storybook/react";
import type { StateTone } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { CellStrip } from "./CellStrip";

const meta: Meta<typeof CellStrip> = {
  title: "DesignSystem/CellStrip",
  component: CellStrip,
  parameters: { backgrounds: { default: "velin" } },
  args: {},
};
export default meta;

type Story = StoryObj<typeof CellStrip>;

const ENG: StateTone[] = [
  "thinking",
  "working",
  "working",
  "blocked",
  "working",
  "idle",
  "done",
  "working",
  "thinking",
  "error",
];
const FIN: StateTone[] = ["blocked", "working", "idle", "thinking"];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">engineering — 10 agents, uncapped</Typography>
        <CellStrip cells={ENG} />
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">engineering — capped at 6, overflow +4</Typography>
        <CellStrip cells={ENG} max={6} />
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">finance — 4 agents, under the cap (no overflow)</Typography>
        <CellStrip cells={FIN} max={6} />
      </div>
    </div>
  ),
};

export const Playground: Story = { args: { cells: ENG } };
