import type { DotTone } from "@zibby/design-system";

/**
 * The chat surface's derived conversational state, computed in {@link ChatScreen}
 * purely from the real chat-stream events + composer draft + last-run status —
 * never a store of its own. `listening` is the operator composing (typing) or the
 * mic being live, `streaming` is tokens arriving, `tool` is a mid-turn agent
 * dispatch, `speaking` is a voice reply playing back (Phase 119b — the turn is
 * done, its audio is speaking), `waiting-approval` is a dispatched run parked on
 * the operator's decision.
 *
 * Relocated from the doomed `scene/sceneTypes.ts` (Task 13 of the immersive
 * orb-map plan) — was `SceneMode`, renamed to drop the WebGL-scene coupling now
 * that the header status dot is its only consumer.
 */
export type ChatMode =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "speaking"
  | "tool"
  | "waiting-approval"
  | "error";

/**
 * The header status dot — the same canonical state vocabulary that used to drive
 * the retired WebGL orb, expressed through the shared `StatusDot` primitive
 * instead of a bespoke inline colour. Maps the derived {@link ChatMode} to a dot
 * tone + whether it's live.
 */
export const MODE_DOT: Record<ChatMode, { tone: DotTone; pulse: boolean }> = {
  idle: { tone: "accent", pulse: false },
  listening: { tone: "accent", pulse: true },
  thinking: { tone: "run", pulse: true },
  streaming: { tone: "run", pulse: true },
  speaking: { tone: "ok", pulse: true },
  tool: { tone: "run", pulse: true },
  "waiting-approval": { tone: "wait", pulse: true },
  error: { tone: "bad", pulse: false },
};
