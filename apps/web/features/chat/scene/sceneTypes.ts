/**
 * The public data types the React layer hands the vanilla-three scene controller.
 * Kept free of any `three` import so `ChatScreen` (and its jsdom tests) can pass
 * them without pulling WebGL into the bundle.
 */

/**
 * The orb's derived conversational state, computed in {@link ChatScreen} purely
 * from the real chat-stream events + composer draft + last-run status — never a
 * store of its own. Substitutes chat activity for the reference design's audio
 * reactions: `listening` is the operator composing (typing), `streaming` is tokens
 * arriving, `tool` is a mid-turn agent dispatch.
 */
export type SceneMode =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "tool"
  | "waiting-approval"
  | "error";

/**
 * A node that can appear in the constellation (Tier 4) — the operator's pinned
 * agents/pipelines/chains first, then the imaged tail of the real agent roster,
 * projected to what the scene needs. Built in {@link buildConstellation}.
 */
export interface SceneAgent {
  /** Stored entity id — matched against a `tool` event's `target.id` to know which
   * avatar was dispatched, and against a live run's `agentId` for the working pulse. */
  id: string;
  /** Entity kind — drives the constellation's visual hierarchy (Phase 35): pipelines
   * (and chains, a composition of pipelines/agents) render as the stronger mark —
   * larger, brighter, haloed — while a plain agent stays the quieter default. */
  kind: "agent" | "pipeline" | "chain";
  /** Canonical (Czech) display name shown on the DOM label. */
  name: string;
  /** One-line specialty from the agent's frontmatter `description` (empty for
   * pipelines/chains, which don't carry one). */
  specialty: string;
  /** Category name (one of the 7) for an agent, driving the cluster colour; empty
   * for pipelines/chains, which have no category. */
  category: string;
  /** Resolved hex accent for this node (from its category, or the neutral default). */
  color: string;
  /** Optional avatar image (data URI or `/avatars/*.png` path). When present the
   * scene paints the real portrait instead of the initial-in-a-disc fallback. */
  avatar?: string;
}

/**
 * A dispatch/working target shown in the dock (Tier 5). Only agents/pipelines that
 * are queued or running appear — never the full roster.
 */
export interface SceneDockItem {
  /** Stable key — the run id when known, else the target id. */
  key: string;
  /** Target id (agent/pipeline) — matched to a constellation avatar to fly it in. */
  targetId: string | null;
  /** Display name. */
  name: string;
  /** `agent` or `pipeline`. */
  kind: "agent" | "pipeline";
  /** Live run status (`running`, `awaiting-approval`, `parked`, `scheduled`, …). */
  status: string;
  /** Resolved hex accent. */
  color: string;
}

/**
 * The frame of inputs pushed into the scene controller whenever the derived chat
 * state changes. The controller eases toward these — nothing is applied hard. The
 * streaming *energy* signal is NOT here: it changes per token, so it's fed through
 * the controller's `pushActivity` and smoothed inside the render loop (frame-rate
 * correct) rather than round-tripping React on every delta.
 */
export interface SceneInputs {
  mode: SceneMode;
  /** The active dock items (Tier 5) — running/queued agents & pipelines. */
  dock: SceneDockItem[];
  /** Whether the operator asked the OS for reduced motion. */
  reducedMotion: boolean;
}
