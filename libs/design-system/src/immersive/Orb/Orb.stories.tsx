import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";
import type { OrbState } from "../orbState";
import { Orb } from "./Orb";

const ALL_STATES: OrbState[] = ["idle", "working", "report", "await", "incident", "thinking"];

const meta: Meta<typeof Orb> = {
  title: "Immersive/Orb",
  component: Orb,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    diameter: 96,
    hex: "#5b8def",
    state: "idle",
    detail: 3,
    antialias: false,
  },
};
export default meta;

type Story = StoryObj<typeof Orb>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap gap-12">
      {ALL_STATES.map((state) => (
        <div className="relative h-32 w-32" key={state}>
          <Orb diameter={96} state={state} />
        </div>
      ))}
    </div>
  ),
};

interface PlaygroundArgs {
  diameter: number;
  hex: string;
  state: OrbState;
  detail: number;
  antialias: boolean;
  amp: number;
  speed: number;
  glow: number;
  breath: number;
}

/** Playground render — a real component so `useMemo` is a valid hook call. */
function PlaygroundRender({
  diameter,
  hex,
  state,
  detail,
  antialias,
  amp,
  speed,
  glow,
  breath,
}: PlaygroundArgs) {
  const motionOverrides = useMemo(() => ({ amp, speed, glow, breath }), [amp, speed, glow, breath]);
  return (
    <div className="relative" style={{ width: diameter * 1.5, height: diameter * 1.5 }}>
      <Orb
        antialias={antialias}
        detail={detail}
        diameter={diameter}
        hex={hex}
        motionOverrides={motionOverrides}
        state={state}
      />
    </div>
  );
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    state: { control: "select", options: ALL_STATES },
    detail: { control: { type: "range", min: 0, max: 5, step: 1 }, name: "polygon count" },
    diameter: { control: { type: "range", min: 40, max: 280, step: 4 } },
    hex: { control: "color" },
    antialias: { control: "boolean" },
    amp: { control: { type: "range", min: 0, max: 0.3, step: 0.005 } },
    speed: { control: { type: "range", min: 0, max: 1.5, step: 0.01 } },
    glow: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    breath: { control: { type: "range", min: 0, max: 2, step: 0.01 } },
  },
  args: {
    diameter: 96,
    hex: "#5b8def",
    state: "idle",
    detail: 3,
    antialias: false,
    amp: 0.05,
    speed: 0.18,
    glow: 0.5,
    breath: 1.0,
  },
  render: (args) => <PlaygroundRender {...args} />,
};
