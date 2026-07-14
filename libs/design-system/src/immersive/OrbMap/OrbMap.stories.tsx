import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Icon } from "../../components/Icon/Icon";
import type { IconName } from "../../components/Icon/Icon";
import type { OrbState } from "../orbState";
import { OrbMap, type OrbMapCore, type OrbMapFlare, type OrbMapNode } from "./OrbMap";

const STAGE_BACKGROUND = "radial-gradient(ellipse 120% 90% at 50% -8%, #101722 0%, #05070c 58%)";

interface SubsystemSample {
  id: string;
  label: string;
  hex: string;
  icon: IconName;
  state: OrbState;
  activeCount: number;
}

const SAMPLES: SubsystemSample[] = [
  { id: "atlas", label: "Atlas", hex: "#7aa5f8", icon: "compass", state: "idle", activeCount: 0 },
  { id: "forge", label: "Forge", hex: "#f0b429", icon: "gear", state: "working", activeCount: 3 },
  { id: "scribe", label: "Scribe", hex: "#3fcf8e", icon: "doc", state: "report", activeCount: 1 },
  { id: "sentry", label: "Sentry", hex: "#f43f5e", icon: "shield", state: "await", activeCount: 2 },
  { id: "mint", label: "Mint", hex: "#ff6b6b", icon: "warn", state: "incident", activeCount: 1 },
  { id: "relay", label: "Relay", hex: "#5b8def", icon: "brain", state: "thinking", activeCount: 2 },
  { id: "scout", label: "Scout", hex: "#22d3ee", icon: "search", state: "idle", activeCount: 0 },
  { id: "codex", label: "Codex", hex: "#a78bfa", icon: "flask", state: "working", activeCount: 4 },
];

function buildNodes(): OrbMapNode[] {
  return SAMPLES.map((s) => ({
    id: s.id,
    hex: s.hex,
    state: s.state,
    label: s.label,
    statusLabel: s.state,
    icon: <Icon name={s.icon} size="lg" />,
    activeCount: s.activeCount,
  }));
}

const CORE: OrbMapCore = { hex: "#5b8def", activeCount: 4, intensity: 0.4, thinking: false };

const meta: Meta<typeof OrbMap> = {
  title: "Immersive/OrbMap",
  component: OrbMap,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof OrbMap>;

export const Overview: Story = {
  render: () => (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ width: 1200, height: 720, background: STAGE_BACKGROUND }}
    >
      <OrbMap core={CORE} nodes={buildNodes()} />
    </div>
  ),
};

const NODE_IDS = SAMPLES.map((s) => s.id);

/** Advances a node through the orb state cycle, one click at a time. */
const STATE_CYCLE: OrbState[] = ["idle", "working", "report", "await", "incident", "thinking"];

function nextState(state: OrbState): OrbState {
  const i = STATE_CYCLE.indexOf(state);
  return STATE_CYCLE[(i + 1) % STATE_CYCLE.length] ?? "idle";
}

interface PlaygroundArgs {
  flareFromId: string;
  flareToId: string;
}

function PlaygroundStage({ flareFromId, flareToId }: PlaygroundArgs) {
  const [nodes, setNodes] = useState<OrbMapNode[]>(buildNodes());
  const [thinking, setThinking] = useState(false);
  const [flares, setFlares] = useState<OrbMapFlare[]>([]);

  const cycleNode = (id: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              state: nextState(n.state),
              statusLabel: nextState(n.state),
              activeCount: (n.activeCount + 1) % 7,
            }
          : n,
      ),
    );
  };

  const triggerFlare = () => {
    const id = `flare-${Date.now()}`;
    setFlares((prev) => [...prev, { id, fromId: flareFromId, toId: flareToId, color: "#ffe066" }]);
    // The flare's own HandoffFlare instance self-retires visually; this timeout drops
    // it from the controlled `flares` prop once its animation has finished playing.
    setTimeout(() => {
      setFlares((prev) => prev.filter((f) => f.id !== id));
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded border border-white/20 px-3 py-1.5 text-sm text-white"
          onClick={() => setThinking((t) => !t)}
          type="button"
        >
          Toggle thinking ({thinking ? "on" : "off"})
        </button>
        <button
          className="rounded border border-white/20 px-3 py-1.5 text-sm text-white"
          onClick={triggerFlare}
          type="button"
        >
          Trigger flare ({flareFromId} to {flareToId})
        </button>
        <span className="text-xs text-white/60">Click a node to cycle its state/count.</span>
      </div>
      <div
        className="relative overflow-hidden rounded-lg"
        style={{ width: 1200, height: 720, background: STAGE_BACKGROUND }}
      >
        <OrbMap
          core={{ ...CORE, thinking }}
          flares={flares}
          nodes={nodes}
          onSelectCore={() => setThinking((t) => !t)}
          onSelectNode={cycleNode}
        />
      </div>
    </div>
  );
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    flareFromId: { control: "select", options: NODE_IDS, name: "flare: from" },
    flareToId: { control: "select", options: NODE_IDS, name: "flare: to" },
  },
  args: { flareFromId: "scout", flareToId: "forge" },
  render: (args) => <PlaygroundStage {...args} />,
};
