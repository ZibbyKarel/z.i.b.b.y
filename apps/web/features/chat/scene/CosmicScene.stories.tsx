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
import type { Meta, StoryObj } from "@storybook/react";
import { Container, Typography } from "@zibby/design-system";
import type { ReactNode } from "react";
import { categoryColor } from "./tokens";
import { CosmicScene, type CosmicSceneProps } from "./CosmicScene";
import type { SceneAgent, SceneDockItem, SceneMode } from "./sceneTypes";

/** The full mode union driving the orb + constellation reaction (`sceneTypes.ts`) —
 * the source of truth `ChatScreen`'s `MODE_DOT` map also switches on. */
const SCENE_MODES: SceneMode[] = [
  "idle",
  "listening",
  "thinking",
  "streaming",
  "tool",
  "waiting-approval",
  "error",
];

/** A small, deterministic constellation roster (Tier 4): a pinned agent per real
 * category, plus one pipeline — enough to see the cluster colours without a live
 * catalog fetch. Mirrors the shape `buildConstellation` produces. */
const ROSTER: SceneAgent[] = [
  {
    category: "Vývoj",
    color: categoryColor("Vývoj"),
    id: "agent-koder",
    kind: "agent",
    name: "Kodér",
    specialty: "Implementuje podle architektury",
  },
  {
    category: "Kvalita",
    color: categoryColor("Kvalita"),
    id: "agent-tester",
    kind: "agent",
    name: "Tester",
    specialty: "Píše a spouští testy",
  },
  {
    category: "Výzkum",
    color: categoryColor("Výzkum"),
    id: "agent-vyzkumnik",
    kind: "agent",
    name: "Výzkumník",
    specialty: "Zjišťuje kontext a zdroje",
  },
  {
    category: "Dokumentace",
    color: categoryColor("Dokumentace"),
    id: "agent-dokumentator",
    kind: "agent",
    name: "Dokumentátor",
    specialty: "Píše dokumentaci a changelog",
  },
  {
    // Pipelines carry no category — the constellation's stronger mark uses the
    // push/purple risk accent instead (tokens.ts `resolvePipelineAccentHex`); the
    // hex is inlined here rather than resolved live so the fixture stays
    // deterministic (matches its documented `--color-risk-push` fallback).
    category: "",
    color: "#b07cff",
    id: "pipeline-delivery",
    kind: "pipeline",
    name: "Delivery Pipeline",
    specialty: "",
  },
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
    agents: { control: false },
    completedTick: {
      control: { max: 5, min: 0, step: 1, type: "number" },
      description: "Bumped once per finished turn — fires the completion flash.",
    },
    dispatch: { control: false },
    dock: { control: false },
    mode: {
      control: "select",
      description: "The derived conversational state driving the orb + constellation.",
      options: SCENE_MODES,
    },
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
    agents: ROSTER,
    completedTick: 0,
    dock: DOCK,
    mode: "idle",
    reducedMotion: false,
    streamChars: 0,
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

/** A mid-turn agent dispatch — fires the beam/flare/ring reaction toward the
 * roster's "Kodér" node. */
export const ToolDispatch: Story = {
  args: { dispatch: { agentId: "agent-koder", seq: 1 }, mode: "tool" },
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
