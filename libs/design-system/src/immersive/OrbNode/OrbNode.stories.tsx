import type { Meta, StoryObj } from "@storybook/react";
import { Icon, iconNames } from "../../components/Icon/Icon";
import type { IconName } from "../../components/Icon/Icon";
import type { OrbState } from "../orbState";
import { OrbNode } from "./OrbNode";

interface StateSample {
  state: OrbState;
  label: string;
  statusLabel: string;
  hex: string;
  icon: IconName;
  activeCount: number;
}

const SAMPLES: StateSample[] = [
  {
    state: "idle",
    label: "Atlas",
    statusLabel: "idle",
    hex: "#7aa5f8",
    icon: "compass",
    activeCount: 0,
  },
  {
    state: "working",
    label: "Forge",
    statusLabel: "working",
    hex: "#f0b429",
    icon: "gear",
    activeCount: 3,
  },
  {
    state: "report",
    label: "Scribe",
    statusLabel: "report ready",
    hex: "#3fcf8e",
    icon: "doc",
    activeCount: 1,
  },
  {
    state: "await",
    label: "Sentry",
    statusLabel: "awaiting review",
    hex: "#f43f5e",
    icon: "shield",
    activeCount: 2,
  },
  {
    state: "incident",
    label: "Mint",
    statusLabel: "incident",
    hex: "#ff6b6b",
    icon: "warn",
    activeCount: 1,
  },
  {
    state: "thinking",
    label: "Relay",
    statusLabel: "thinking",
    hex: "#5b8def",
    icon: "brain",
    activeCount: 2,
  },
];

const meta: Meta<typeof OrbNode> = {
  title: "Immersive/OrbNode",
  component: OrbNode,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    diameter: 76,
    hex: "#5b8def",
    state: "idle",
    label: "Atlas",
    statusLabel: "idle",
    activeCount: 2,
    nodeId: "atlas",
  },
};
export default meta;

type Story = StoryObj<typeof OrbNode>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap gap-16">
      {SAMPLES.map((sample) => (
        <div className="relative h-40 w-32" key={sample.state}>
          <OrbNode
            activeCount={sample.activeCount}
            diameter={76}
            hex={sample.hex}
            icon={<Icon name={sample.icon} size="lg" />}
            label={sample.label}
            nodeId={sample.state}
            state={sample.state}
            statusLabel={sample.statusLabel}
          />
        </div>
      ))}
    </div>
  ),
};

interface PlaygroundArgs {
  state: OrbState;
  diameter: number;
  hex: string;
  activeCount: number;
  label: string;
  statusLabel: string;
  iconName: IconName;
}

const ALL_STATES: OrbState[] = ["idle", "working", "report", "await", "incident", "thinking"];

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    state: { control: "select", options: ALL_STATES },
    diameter: { control: { type: "range", min: 40, max: 140, step: 2 } },
    hex: { control: "color" },
    activeCount: { control: { type: "range", min: 0, max: 6, step: 1 } },
    label: { control: "text" },
    statusLabel: { control: "text" },
    iconName: { control: "select", options: iconNames, name: "icon" },
  },
  args: {
    state: "working",
    diameter: 76,
    hex: "#f0b429",
    activeCount: 3,
    label: "Forge",
    statusLabel: "working",
    iconName: "gear",
  },
  render: ({ state, diameter, hex, activeCount, label, statusLabel, iconName }) => (
    <div className="relative h-48 w-40">
      <OrbNode
        activeCount={activeCount}
        diameter={diameter}
        hex={hex}
        icon={<Icon name={iconName} size="lg" />}
        label={label}
        nodeId="playground"
        state={state}
        statusLabel={statusLabel}
      />
    </div>
  ),
};
