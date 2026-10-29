import { z } from "zod";
import { ChatPersonaSchema } from "../chat/chat.schema";
import { TeamIdSchema } from "../teams/team.schema";

/** Bridge board density — scales the design-system spacing tokens system-wide. */
export const DensitySchema = z.enum(["compact", "comfort", "airy", "open"]);
export type Density = z.infer<typeof DensitySchema>;

/**
 * One widget placed on the Bridge's 12-column board. `x`/`w` are column units (the
 * widget must fit the grid), `y`/`h` are row units (unbounded downwards).
 */
export const BridgeWidgetSchema = z.object({
  id: z.string().min(1),
  /** Catalog entry this widget renders. */
  type: z.enum([
    "briefing",
    "issues",
    "prs",
    "tasks",
    "runs",
    "pins",
    "todo",
    "quickActions",
    "teamKb",
    "proposals",
    "budgets",
  ]),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(2).max(12),
  h: z.number().int().min(1),
  /** Optional scope; only the `teamKb` widget reads it (`teamId` = the team it shows). */
  scope: z.object({ teamId: TeamIdSchema.optional() }).strict().optional(),
});
export type BridgeWidget = z.infer<typeof BridgeWidgetSchema>;

/**
 * Operator UI preferences persisted server-side (so they follow the operator across
 * browsers). `prefault` — not `default` — so the nested field defaults are applied to
 * an absent block (zod 4's `default` would skip parsing the `{}`).
 */
export const UiSettingsSchema = z.object({
  /** System-wide spacing density. Default `"airy"`. */
  density: DensitySchema.default("airy"),
  bridge: z
    .object({
      /** Current board layout; `null` = the built-in DEFAULT preset. */
      layout: z.array(BridgeWidgetSchema).nullable().default(null),
      /** Name of the active preset (`DEFAULT`, `REVIEW`, a saved name, or `CUSTOM`). */
      preset: z.string().min(1).default("DEFAULT"),
      /** Operator-saved named layouts. */
      saved: z.record(z.string(), z.array(BridgeWidgetSchema)).default({}),
      /** Legacy: saved layouts shown in the header, read only while `arranged` is null. */
      favorites: z.array(z.string()).default([]),
      /**
       * Layout order from the layout manager: `shown` sit in the header in order, `hidden`
       * behind its dropdown; DEFAULT is a layout like any other. `null` = never arranged (DEFAULT, REVIEW
       * + `favorites` shown).
       */
      arranged: z
        .object({ shown: z.array(z.string()), hidden: z.array(z.string()) })
        .nullable()
        .default(null),
      /** Deleted built-in layouts (only `REVIEW` is deletable). */
      removed: z.array(z.string()).default([]),
      /** Widget id -> collapsed. */
      collapsed: z.record(z.string(), z.boolean()).default({}),
      /** Epic group key -> closed (Issues widget). */
      epicClosed: z.record(z.string(), z.boolean()).default({}),
    })
    .prefault({}),
});
export type UiSettings = z.infer<typeof UiSettingsSchema>;

/**
 * Operator-owned runtime system config — `data/system-config.json`. These knobs were
 * formerly start-only environment variables (`TASK_TICK_MS`, `GOAL_AUTO_RESUME`, …);
 * they are now file-backed and editable from `/settings`, in
 * keeping with the Law "files are the source of truth". A missing/garbage file reads
 * as the schema default — every field has one, so `{}` parses to a complete config and
 * the defaults reproduce the historical "env unset" behaviour exactly.
 *
 * `.strict()` so a stale/renamed key can't smuggle in a knob the server doesn't honour.
 */
export const SystemConfigSchema = z
  .object({
    /** Task scheduler heartbeat (ms). `0` disables the loop (drive `tick()` directly). */
    taskTickMs: z.number().int().min(0).default(30_000),
    /** Channel watcher poll interval (ms). `0` disables. */
    channelTickMs: z.number().int().min(0).default(30_000),
    /** Monitor watcher poll interval (ms) — CI status alerts (N3). `0` disables. */
    monitorTickMs: z.number().int().min(0).default(60_000),
    /**
     * Project-health watcher tick (ms, TODO 11). Each tick checks every project whose
     * own `healthCheck.intervalSec` has elapsed. `0` disables.
     */
    projectHealthTickMs: z.number().int().min(0).default(30_000),
    /** Automation scheduler loop interval (ms). `0` disables (the historical default). */
    automationTickMs: z.number().int().min(0).default(0),
    /** Limit-resume daemon scan interval (ms). `0` disables. */
    limitResumeTickMs: z.number().int().min(0).default(60_000),
    /** Max auto-resume cycles a limit-paused run gets before it is parked/failed. */
    limitResumeMax: z.number().int().min(1).default(3),
    /**
     * On boot, auto-re-dispatch `running`/`paused-limit` goals (unattended/headless
     * mode). Default `false` → goals are parked `awaiting-resume` for an explicit
     * operator resume (Law 3). The operator enables this for a launchd daemon.
     */
    goalAutoResume: z.boolean().default(false),
    /**
     * The conversational personality of the chat butler. Only ZIBBY's tone varies;
     * the answer/ask/act governor is constant. Read at chat-turn time (live, no
     * restart); applies to the next conversation. Default `"jarvis"`.
     */
    chatPersona: ChatPersonaSchema.default("jarvis"),
    /**
     * Caps the chat 3D scene for lower GPU/fan load (30 fps, no antialiasing,
     * freezes after the intro animation). Instant-apply from `/settings`. Default
     * `false`.
     */
    powerSaver: z.boolean().default(false),
    /**
     * The `speakd` voice id chat TTS requests (phase-120 read-aloud button and
     * phase-119b auto-speak). `null` (default) means "let the daemon pick its own
     * default voice" — no override is sent. Set from `/settings`'s voice picker
     * (`GET /api/speech/voices`); an unknown id is the daemon's problem to reject,
     * surfaced at synthesize time as the usual mutation-error toast, not validated
     * here.
     */
    ttsVoice: z.string().min(1).nullable().default(null),
    /**
     * The global run-slot cap (docs/plans/remove-employees.md): at most this many runs
     * started by the task system (single-agent, orchestrator, workflow or goal — one slot
     * per run, however many agents it spawns) are in flight at once; the rest queue. A run
     * holds its slot until a terminal status, including while it awaits an approval. Read
     * live by `RunSlots`. Migrated from the interim `maxWorkingAgents` on read
     * (`SystemConfigStore`).
     */
    maxConcurrentRuns: z.number().int().positive().default(3),
    /**
     * Roadmap gate-poll heartbeat (ms, 125h) — each tick drives, for every project
     * with a roadmap, `RoadmapGateService.reconcileRunning`/`reconcileAwaitingMerge`
     * (the poll half of the two release signals — a PR merged directly on GitHub
     * still releases its dependents), then runs auto-pickup for every project with
     * `autoPlay: true`. Also paces `PrAutomationService`. `0` disables.
     * Editable from `/settings?tab=runtime`; read live (never cached) via
     * `SystemConfigStore.current()`.
     */
    roadmapTickMs: z.number().int().min(0).default(900_000),
    /**
     * Activity Dock: how many finished (done/failed) tasks the dock's "Hotové" list
     * shows. Editable from `/settings` (runtime section); default 20.
     */
    dockDoneTasksLimit: z.number().int().min(1).max(100).default(20),
    /**
     * O-21: the ZibbyCorp header's "CEO" identity and brand name. Both additive and
     * optional (no default here — an absent value reads as `undefined`, not a
     * schema-picked string) because the real default is presentation-layer: the
     * header shows `operatorName ?? "CEO"`, and the shipped `companyName` fallback
     * is `"ZibbyCorp"`. Nothing seeds `operatorName` from the git user automatically
     * (that would silently expose git config); the operator sets it once from
     * `/system/settings/general`.
     */
    operatorName: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    /** Operator UI preferences (density, Bridge board layout). */
    ui: UiSettingsSchema.prefault({}),
  })
  .strict();
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
