import type { Meta, StoryObj } from "@storybook/react";
import { STATE_ORDER } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { ZibbyAvatar } from "../ZibbyAvatar/ZibbyAvatar";
import { MinionFigure } from "./MinionFigure";
import { MinionScene } from "./MinionScene";
import { MinionWalker } from "./MinionWalker";
import {
  type MinionAppearance,
  ZIBBY_APPEARANCE,
  minionAppearanceFromSeed,
} from "./minionAppearance";

const meta: Meta<typeof MinionFigure> = {
  title: "DesignSystem/Minion",
  component: MinionFigure,
  args: { state: "working", size: 112, appearance: minionAppearanceFromSeed("Kevin") },
  argTypes: { state: { control: "select", options: STATE_ORDER } },
};
export default meta;

type Story = StoryObj<typeof MinionFigure>;

const CREW: readonly (readonly [string, MinionAppearance])[] = [
  ["Stuart", { width: 44, height: 54, eyes: 2, hair: "spikes", hat: "headphones", skin: 0 }],
  ["Dave", { width: 38, height: 66, eyes: 1, hair: "sprout", skin: 2 }],
  ["Kevin", { width: 50, height: 58, eyes: 2, hair: "tuft", hat: "hardhat", skin: 1 }],
  ["Ken", { width: 42, height: 50, eyes: 1, hair: "tuft", hat: "beanie", skin: 0 }],
  ["Mel", { width: 56, height: 52, eyes: 2, hair: "strands", skin: 2 }],
];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">figure — 6 states</Typography>
        <div className="flex items-end gap-6">
          {STATE_ORDER.map((state) => (
            <div className="flex flex-col items-center gap-2" key={state}>
              <MinionFigure
                appearance={minionAppearanceFromSeed("Kevin")}
                size={112}
                state={state}
              />
              <Typography type="micro">{state}</Typography>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">scene — 6 states</Typography>
        <div className="grid grid-cols-3 gap-4">
          {STATE_ORDER.map((state, i) => (
            <div className="flex flex-col gap-1" key={state}>
              <MinionScene
                appearance={minionAppearanceFromSeed("Kevin")}
                phase={i * 0.2}
                state={state}
              />
              <Typography type="micro">{state}</Typography>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">crew and seeded employees</Typography>
        <div className="flex items-end gap-6">
          {CREW.map(([name, appearance]) => (
            <div className="flex flex-col items-center gap-2" key={name}>
              <MinionFigure appearance={appearance} size={112} state="idle" />
              <Typography type="micro">{name}</Typography>
            </div>
          ))}
          {["Otto", "Pepa", "Lenka"].map((seed) => (
            <div className="flex flex-col items-center gap-2" key={seed}>
              <MinionFigure appearance={minionAppearanceFromSeed(seed)} size={112} state="idle" />
              <Typography type="micro">{seed}</Typography>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">walker — empty / carrying</Typography>
        <div className="flex items-end gap-6">
          <MinionWalker appearance={minionAppearanceFromSeed("Kevin")} size={112} />
          <MinionWalker carry appearance={minionAppearanceFromSeed("Otto")} size={112} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">Zibby — glow goggles + moustache</Typography>
        <div className="flex items-end gap-6">
          {STATE_ORDER.map((state) => (
            <div className="flex flex-col items-center gap-2" key={state}>
              <ZibbyAvatar size={112} state={state} />
              <Typography type="micro">{state}</Typography>
            </div>
          ))}
          <MinionFigure lens stache appearance={ZIBBY_APPEARANCE} size={112} state="working" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
