import { z } from "zod";
import { ChatPersonaSchema } from "../chat/chat.schema";

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
    /** Automation scheduler loop interval (ms). `0` disables (the historical default). */
    automationTickMs: z.number().int().min(0).default(0),
    /** Limit-resume daemon scan interval (ms). `0` disables. */
    limitResumeTickMs: z.number().int().min(0).default(60_000),
    /** Max auto-resume cycles a limit-paused run gets before it is parked/failed. */
    limitResumeMax: z.number().int().min(1).default(3),
    /** Verifier shell wall-clock deadline (ms) for a goal `checks` verifier. */
    goalVerifyTimeoutMs: z.number().int().positive().default(600_000),
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
     * Machine fuse (staffing-driven capacity, decision 2): the ceiling on concurrently
     * WORKING agents started by the task system — every single-agent / orchestrator task
     * run and every workflow agent stage, leased or not. A queued task (waiting for an
     * employee or a slot) holds none; a single-agent / orchestrator run holds its slot
     * until a terminal status, including `awaiting-approval` / `paused-limit`. In-memory:
     * a run that survives an API restart is not counted until it ends. NOT a "how many tasks at once" knob —
     * that is decided by headcount per department. Read live (never cached) by
     * `WorkingAgentsFuse`. Migrated from the removed `maxConcurrentRuns` on read
     * (`SystemConfigStore`).
     */
    maxWorkingAgents: z.number().int().positive().default(3),
    /**
     * Roadmap auto-sync + gate-poll heartbeat (ms, 125h) — each tick re-syncs
     * every project whose roadmap config has `autoSync: true`
     * (`RoadmapSourceService.sync`) and, for every project with a roadmap,
     * drives `RoadmapGateService.reconcileRunning`/`reconcileAwaitingMerge`
     * (the poll half of the two release signals — a PR merged directly on
     * GitHub still releases its dependents even with auto-sync off), then runs
     * auto-pickup for every project with `autoPlay: true`. `0` disables.
     * Editable from `/settings?tab=runtime`; read live (never cached) via
     * `SystemConfigStore.current()`.
     */
    roadmapTickMs: z.number().int().min(0).default(60_000),
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
  })
  .strict();
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
