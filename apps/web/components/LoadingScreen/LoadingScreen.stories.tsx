import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { LoadingScreen } from "./LoadingScreen";

const meta: Meta<typeof LoadingScreen> = {
  title: "Dashboard/LoadingScreen",
  component: LoadingScreen,
  parameters: { layout: "fullscreen" },
  args: {
    wordmark: "Z.I.B.B.Y",
    tagline: "Intelligent Automation Platform",
    version: "v2.4.1 · BUILD 2026.06",
    progress: 64,
    status: "Syncing knowledge base…",
  },
};
export default meta;

type Story = StoryObj<typeof LoadingScreen>;

/** Stand-in mark — square clipped to the circular halo, like the real logo. */
function Mark() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        background: "radial-gradient(circle at 50% 40%, #1b2740, #05070b)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#5b8def",
        fontSize: 88,
        fontWeight: 700,
      }}
    >
      Z
    </div>
  );
}

export const Static: Story = {
  render: (args) => <LoadingScreen {...args} logo={<Mark />} />,
};

const PHASES = [
  { at: 0, text: "Initializing core systems…" },
  { at: 12, text: "Loading agent registry…" },
  { at: 26, text: "Establishing secure channel…" },
  { at: 41, text: "Mounting pipeline orchestrator…" },
  { at: 58, text: "Syncing knowledge base…" },
  { at: 72, text: "Calibrating gate rules…" },
  { at: 85, text: "Warming inference endpoints…" },
  { at: 94, text: "System ready." },
];

export const Animated: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
      const id = setInterval(() => {
        setProgress((p) => (p >= 100 ? 0 : Math.min(100, p + 2)));
      }, 90);
      return () => clearInterval(id);
    }, []);
    const status = [...PHASES].reverse().find((p) => p.at <= progress)?.text;
    return <LoadingScreen {...args} logo={<Mark />} progress={progress} status={status} />;
  },
};
