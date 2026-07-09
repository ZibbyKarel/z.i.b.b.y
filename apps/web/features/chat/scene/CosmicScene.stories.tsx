/**
 * Phase 37 — one story per `CosmicScene` background mode, so the operator can see
 * every possible chat-scene backdrop at a glance (and flip between them live via
 * the Controls panel). Each story feeds static, deterministic props — a small
 * fixed constellation roster + dock, a fixed `mode` — never a live chat stream.
 *
 * The global Storybook decorator (`.storybook/preview.tsx`) already wraps every
 * story in `DesignSystemProvider theme="dark"`, so this file doesn't repeat that;
 * it only adds the full-bleed dark frame the scene needs to be visible (the real
 * `CosmicScene` renders `position: absolute; inset: 0`, filling its nearest
 * positioned ancestor — same contract `ChatScreen` relies on).
 */
import { SUBSYSTEMS, type SubsystemState, type SubsystemWithStatus } from "@zibby/contracts";
import type { Meta, StoryObj } from "@storybook/react";
import { Container, Typography } from "@zibby/design-system";
import type { ReactNode } from "react";
import { categoryColor } from "./tokens";
import { CosmicScene, type CosmicSceneProps } from "./CosmicScene";
import type { SceneDockItem, SceneMode } from "./sceneTypes";

/** The full mode union driving the orb reaction (`sceneTypes.ts`) — the source of
 * truth `ChatScreen`'s `MODE_DOT` map also switches on. */
const SCENE_MODES: SceneMode[] = [
  "idle",
  "listening",
  "thinking",
  "streaming",
  "tool",
  "waiting-approval",
  "error",
];

/** The dock (Tier 5): one running agent, one queued pipeline. */
const DOCK: SceneDockItem[] = [
  {
    color: categoryColor("Vývoj"),
    key: "run-koder-1",
    kind: "agent",
    name: "Kodér",
    status: "running",
    targetId: "agent-koder",
  },
  {
    color: "#b07cff",
    key: "run-delivery-1",
    kind: "pipeline",
    name: "Delivery Pipeline",
    status: "queued",
    targetId: "pipeline-delivery",
  },
];

/** A sample subsystem roster (phase 95): the 8 registry subsystems with a spread of
 * live states so the mini-orbs' per-state look (klid dim, bezi/ceka pulse, ceka
 * louder + warn badge, hlaseni ok badge) is visible at a glance in the story. */
const SAMPLE_STATES: Partial<Record<string, { state: SubsystemState; tier2Count?: number; tier3Count?: number }>> = {
  forge: { state: "bezi" },
  puls: { state: "bezi" },
  sentinel: { state: "ceka", tier3Count: 2 },
  beacon: { state: "hlaseni", tier2Count: 3 },
  scout: { state: "bezi" },
};
const SUBSYSTEM_ROSTER: SubsystemWithStatus[] = SUBSYSTEMS.map((s) => {
  const override = SAMPLE_STATES[s.id];
  return {
    ...s,
    state: override?.state ?? "klid",
    tier2Count: override?.tier2Count ?? 0,
    tier3Count: override?.tier3Count ?? 0,
  };
});

interface SceneFrameProps {
  children: ReactNode;
  label: string;
}

/** Full-bleed dark frame sized like the real chat surface (`ChatScreen`'s root is
 * `relative h-full w-full`) — the one place this file reaches for a raw style, to
 * paint the deep-space background colour behind the scene; `Container` has no
 * background-colour prop, so this goes through its documented `style`
 * passthrough. A label overlay names the mode so the story set reads at a glance. */
function SceneFrame({ children, label }: SceneFrameProps) {
  return (
    <Container
      height="640px"
      overflow="hidden"
      position="relative"
      style={{ backgroundColor: "var(--color-background-deep)" }}
      width="100%"
    >
      {children}
      <Container left="0" padding="200" pointerEvents="none" position="absolute" top="0">
        <Typography mono size="sm" tone="accent" tracking="widest" type="note">
          {label}
        </Typography>
      </Container>
    </Container>
  );
}

/**
 * `CosmicScene` reads `prefers-reduced-motion` internally via
 * `usePrefersReducedMotion` — a one-shot hook read at mount, not a prop — so the
 * only way to drive it from a story is to stub `window.matchMedia` before the
 * scene mounts (paired with remounting via a `key` so the one-shot read re-fires
 * when the control flips). Storybook-only; never used outside this file.
 */
function stubPrefersReducedMotion(matches: boolean): void {
  if (typeof window === "undefined") return;
  window.matchMedia = (() => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

interface CosmicSceneStoryProps extends CosmicSceneProps {
  /** Storybook-only control — see {@link stubPrefersReducedMotion}. */
  reducedMotion?: boolean;
}

function CosmicSceneStory({ reducedMotion = false, ...sceneProps }: CosmicSceneStoryProps) {
  stubPrefersReducedMotion(reducedMotion);
  const label = reducedMotion ? `${sceneProps.mode ?? "idle"} · reduced motion` : (sceneProps.mode ?? "idle");
  return (
    <SceneFrame label={label}>
      <CosmicScene key={String(reducedMotion)} {...sceneProps} />
    </SceneFrame>
  );
}

const meta: Meta<typeof CosmicSceneStory> = {
  argTypes: {
    completedTick: {
      control: { max: 5, min: 0, step: 1, type: "number" },
      description: "Bumped once per finished turn — fires the completion flash.",
    },
    dock: { control: false },
    mode: {
      control: "select",
      description: "The derived conversational state driving the orb.",
      options: SCENE_MODES,
    },
    subsystems: { control: false },
    selectedSubsystemId: { control: false },
    reducedMotion: {
      control: "boolean",
      description: "Simulates the OS prefers-reduced-motion setting.",
    },
    streamChars: {
      control: { max: 500, min: 0, step: 20, type: "number" },
      description: "Cumulative streamed-character count — feeds the streaming energy signal.",
    },
  },
  args: {
    completedTick: 0,
    dock: DOCK,
    mode: "idle",
    reducedMotion: false,
    streamChars: 0,
    subsystems: SUBSYSTEM_ROSTER,
    selectedSubsystemId: "sentinel",
  },
  component: CosmicSceneStory,
  parameters: { layout: "fullscreen" },
  title: "Chat/CosmicScene",
};
export default meta;

type Story = StoryObj<typeof CosmicSceneStory>;

export const Idle: Story = { args: { mode: "idle" } };

export const Listening: Story = { args: { mode: "listening" } };

export const Thinking: Story = { args: { mode: "thinking" } };

/** Streaming with a non-zero `streamChars` — contrast against `Idle`'s zero to
 * see the streaming/active vs idle backdrop difference. */
export const Streaming: Story = { args: { mode: "streaming", streamChars: 240 } };

/** A mid-turn agent dispatch — the orb takes its `tool` target (a pronounced pulse
 * and rings) even though the constellation ring it used to beam toward is gone. */
export const ToolDispatch: Story = {
  args: { mode: "tool" },
};

/** A run parked on the operator's decision. Reads in the shared `warn` (amber) tone —
 * a "needs you" warning — visibly distinct from {@link ErrorState}'s red `bad` tone, so
 * awaiting-approval is never mistaken for a failure (mirrors `runStateTone`). */
export const WaitingApproval: Story = { args: { mode: "waiting-approval" } };

/** The turn errored. Reads in the `bad` (red) tone — contrast it against
 * {@link WaitingApproval}'s amber `warn` tone to confirm the two states differ. */
export const ErrorState: Story = { args: { mode: "error" } };

/** Same streaming state as {@link Streaming}, with the OS's reduced-motion
 * preference simulated — rotation/drift damps, the surface stays calmer. */
export const ReducedMotion: Story = {
  args: { mode: "streaming", reducedMotion: true, streamChars: 240 },
};
