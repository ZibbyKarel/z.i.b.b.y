import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { HandoffFlare } from "./HandoffFlare";

const FROM = { x: 60, y: 60 };
const TO = { x: 340, y: 220 };

const meta: Meta<typeof HandoffFlare> = {
  title: "Immersive/HandoffFlare",
  component: HandoffFlare,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    from: FROM,
    to: TO,
    color: "#ffe066",
    durationMs: 1300,
  },
};
export default meta;

type Story = StoryObj<typeof HandoffFlare>;

export const Overview: Story = {
  render: (args) => (
    <div className="relative h-[280px] w-[420px] overflow-hidden rounded-lg bg-black">
      <div
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
        style={{ left: FROM.x, top: FROM.y }}
      />
      <div
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
        style={{ left: TO.x, top: TO.y }}
      />
      <HandoffFlare {...args} />
    </div>
  ),
};

interface PlaygroundArgs {
  color: string;
  durationMs: number;
}

/** Playground render — a real component so `useState` (the replay key) is a valid hook call. */
function PlaygroundRender({ color, durationMs }: PlaygroundArgs) {
  const [replayKey, setReplayKey] = useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        className="rounded border border-white/20 px-3 py-1 text-sm text-white"
        onClick={() => setReplayKey((k) => k + 1)}
        type="button"
      >
        Replay
      </button>
      <div className="relative h-[280px] w-[420px] overflow-hidden rounded-lg bg-black">
        <div
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
          style={{ left: FROM.x, top: FROM.y }}
        />
        <div
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
          style={{ left: TO.x, top: TO.y }}
        />
        <HandoffFlare color={color} durationMs={durationMs} from={FROM} key={replayKey} to={TO} />
      </div>
    </div>
  );
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    color: { control: "color" },
    durationMs: { control: { type: "range", min: 400, max: 3000, step: 50 } },
  },
  args: {
    color: "#ffe066",
    durationMs: 1300,
  },
  render: (args) => <PlaygroundRender {...args} />,
};
