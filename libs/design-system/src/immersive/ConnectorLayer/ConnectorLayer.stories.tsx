import type { Meta, StoryObj } from "@storybook/react";
import { ConnectorLayer, type ConnectorNode } from "./ConnectorLayer";

const CENTER = { x: 300, y: 220 };

const ringNodes: ConnectorNode[] = [
  { id: "codex", x: 300, y: 40, color: "#8b5cf6", live: true },
  { id: "atlas", x: 500, y: 130, color: "#22d3ee", live: true },
  { id: "forge", x: 540, y: 320, color: "#f97316", live: false },
  { id: "scribe", x: 380, y: 400, color: "#34d399", live: false },
  { id: "sentry", x: 180, y: 400, color: "#f43f5e", live: true },
  { id: "mint", x: 60, y: 320, color: "#facc15", live: false },
  { id: "relay", x: 100, y: 130, color: "#60a5fa", live: false },
];

function Stage({ nodes }: { nodes: ConnectorNode[] }) {
  return (
    <div className="relative h-[440px] w-[600px] overflow-hidden rounded-lg bg-black">
      <ConnectorLayer center={CENTER} nodes={nodes} />
      {nodes.map((n) => (
        <div
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          key={n.id}
          style={{ left: n.x, top: n.y, background: n.color }}
        />
      ))}
      <div
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{ left: CENTER.x, top: CENTER.y }}
      />
    </div>
  );
}

const meta: Meta<typeof ConnectorLayer> = {
  title: "Immersive/ConnectorLayer",
  component: ConnectorLayer,
  parameters: { backgrounds: { default: "velin" } },
  args: { center: CENTER, nodes: ringNodes },
};
export default meta;

type Story = StoryObj<typeof ConnectorLayer>;

export const Overview: Story = {
  render: (args) => <Stage nodes={args.nodes} />,
};

interface PlaygroundArgs {
  liveCount: number;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    liveCount: { control: { type: "range", min: 0, max: ringNodes.length, step: 1 } },
  },
  args: { liveCount: 3 },
  render: ({ liveCount }) => {
    const nodes = ringNodes.map((n, i) => ({ ...n, live: i < liveCount }));
    return <Stage nodes={nodes} />;
  },
};
