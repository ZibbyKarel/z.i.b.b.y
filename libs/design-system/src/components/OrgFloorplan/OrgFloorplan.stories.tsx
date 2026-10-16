import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useState } from "react";
import { OrgFloorplan, type OrgFloorplanRoom, type OrgFloorplanWalker } from "./OrgFloorplan";

const ROOMS: OrgFloorplanRoom[] = [
  {
    id: "dev",
    code: "DEV",
    name: "Development",
    zone: "eng",
    agents: [
      {
        id: "dev-01",
        name: "Stuart",
        role: "Coder",
        state: "thinking",
        task: "Addressing review comments on PR #318",
      },
      {
        id: "dev-02",
        name: "Bob",
        role: "Coder",
        state: "blocked",
        task: "Fixing flaky checkout test",
      },
      {
        id: "dev-03",
        name: "Dave",
        role: "Reviewer",
        state: "working",
        task: "Reviewing PR #318 · 14 files",
      },
      { id: "dev-04", name: "Jorge", role: "Coder", state: "done" },
      {
        id: "dev-05",
        name: "Ken",
        role: "Coder",
        state: "error",
        task: "Fixing findings in services/orders",
      },
      { id: "dev-06", name: "Kevin", role: "Architect", state: "idle" },
    ],
  },
  {
    id: "rnd",
    code: "RND",
    name: "R&D",
    zone: "eng",
    agents: [{ id: "rnd-01", name: "Otto", state: "thinking" }],
  },
  {
    id: "qa",
    code: "QA",
    name: "QA & Architecture",
    zone: "eng",
    agents: [{ id: "qa-01", name: "Paul", state: "done" }],
  },
  {
    id: "com",
    code: "COM",
    name: "Communications",
    zone: "biz",
    agents: [{ id: "com-01", name: "Larry", state: "blocked" }],
  },
  {
    id: "fin",
    code: "FIN",
    name: "Finance",
    zone: "biz",
    agents: [{ id: "fin-01", name: "Fay", state: "working" }],
  },
  {
    id: "dist",
    code: "DIST",
    name: "Distribution",
    zone: "biz",
    agents: [{ id: "dist-01", name: "Mina", state: "error" }],
  },
  {
    id: "ops",
    code: "OPS",
    name: "Monitoring & Ops",
    zone: "ops",
    agents: [{ id: "ops-01", name: "Ray", state: "working" }],
  },
  {
    id: "per",
    code: "PER",
    name: "Personal Office",
    zone: "per",
    agents: [{ id: "per-01", name: "Ned", state: "idle" }],
  },
  { id: "lab", code: "LAB", name: "Unlisted department", zone: "biz", agents: [] },
];

/** Trips the demo hands out in turn — each is replaced a moment after it finishes. */
const TRIPS: Omit<OrgFloorplanWalker, "id">[] = [
  { agentId: "dev-04", toRoomId: "qa", label: "PR #322" },
  { agentId: "dev-03", toRoomId: "com", label: "release-notes.md" },
  { agentId: "rnd-01", toRoomId: "dev", label: "research.md" },
];

function WalkingFloorplan() {
  const [seq, setSeq] = useState(TRIPS.length);
  const [walkers, setWalkers] = useState<OrgFloorplanWalker[]>(
    TRIPS.map((t, i) => ({ ...t, id: `trip-${i}` })),
  );
  const done = useCallback((id: string) => {
    setSeq((n) => n + 1);
    setWalkers((all) => {
      const finished = all.find((w) => w.id === id);
      const rest = all.filter((w) => w.id !== id);
      if (!finished) return rest;
      // Re-queue the same errand so the story keeps moving.
      return [...rest, { ...finished, id: `${id}-r${Date.now()}` }];
    });
  }, []);
  return (
    <OrgFloorplan
      coo={{ state: "working", label: "Zibby · COO", speech: `${seq} trips so far` }}
      onWalkerDone={done}
      rooms={ROOMS}
      walkers={walkers}
    />
  );
}

const meta: Meta<typeof OrgFloorplan> = {
  title: "DesignSystem/OrgFloorplan",
  component: OrgFloorplan,
  parameters: { layout: "fullscreen" },
  args: {
    rooms: ROOMS,
    coo: { state: "working", label: "Zibby · COO" },
    walkers: [{ id: "w1", agentId: "dev-04", toRoomId: "qa", label: "PR #322" }],
  },
};
export default meta;

type Story = StoryObj<typeof OrgFloorplan>;

export const Overview: Story = {
  render: () => (
    <div className="h-[720px] w-full">
      <WalkingFloorplan />
    </div>
  ),
};

export const Playground: Story = {
  decorators: [
    (Story) => (
      <div className="h-[720px] w-full">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    coo: { control: "object" },
  },
};
