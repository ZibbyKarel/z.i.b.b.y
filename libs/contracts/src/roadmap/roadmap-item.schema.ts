import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ProjectIdSchema } from "../projects/project.schema";
import { AttachmentSchema, TaskOutputSchema } from "../tasks/task.schema";

/**
 * Allowed shape of a roadmap item `id`. The id doubles as the on-disk file
 * name (`<itemId>.json`), so it is deliberately restrictive — same shape as
 * `AGENT_ID_REGEX`: letters, numbers, `.`, `_` and `-`, never starting or
 * ending with a separator. This rules out path separators and traversal
 * sequences at the contract boundary; the store enforces the same rule
 * independently (defense in depth). Deliberately NOT re-exported from
 * `agent.schema.ts` — the two ids are shaped alike by convention, not by a
 * shared type, so either can evolve independently later.
 */
export const ROADMAP_ITEM_ID_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

export const RoadmapItemIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(ROADMAP_ITEM_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

/**
 * Deterministically derive an imported item's id from its source: a slug of
 * `<integrationId>-<externalId>`, lowercased, diacritics stripped, anything
 * that isn't `[a-z0-9]` collapsed to a single `-`, leading/trailing `-`
 * trimmed. Reused across re-imports so `(integrationId, externalId)` always
 * resolves to the same file — that IS the upsert key (125b). Falls back to
 * `"item"` on a degenerate all-punctuation input so the result is never empty
 * (and so always satisfies {@link ROADMAP_ITEM_ID_REGEX}).
 *
 * Collision note: two DIFFERENT `(integrationId, externalId)` pairs can in
 * theory slug to the same string (e.g. `"jira-1"`/`"abc-2"` vs
 * `"jira"`/`"1-abc-2"`) — the join is a plain string concatenation, not a
 * length-prefixed encoding. Accepted per the master plan's literal spec
 * (`slug(\`<integrationId>-<externalId>\`)`); integration ids are a small,
 * operator-configured set and external ids are source-issued, so a real
 * collision would require a deliberately adversarial pairing. Flagged here so
 * a future sub-phase can tighten it (e.g. a length-prefixed join) without
 * re-deriving why the simple version was chosen first.
 */
export function roadmapItemIdForSource(integrationId: string, externalId: string): string {
  const slug = `${integrationId}-${externalId}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

/** The two levels a roadmap item can sit at — epics group tasks. */
export const RoadmapItemLevelSchema = z.enum(["epic", "task"]);
export type RoadmapItemLevel = z.infer<typeof RoadmapItemLevelSchema>;

/** Where an item came from. `manual` items have no `integrationId`/`externalId`. */
export const RoadmapSourceKindSchema = z.enum(["jira", "github", "manual"]);
export type RoadmapSourceKind = z.infer<typeof RoadmapSourceKindSchema>;

/**
 * Provenance of a roadmap item. `integrationId`/`externalId` key the upsert
 * (125b); `externalKey` is the human-facing id shown on the card (`PROJ-14`,
 * `#42`) and linked via `url` — both absent for `manual` items.
 */
export const RoadmapSourceSchema = z.object({
  kind: RoadmapSourceKindSchema,
  integrationId: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  externalKey: z.string().min(1).optional(),
  url: z.string().url().optional(),
});
export type RoadmapSource = z.infer<typeof RoadmapSourceSchema>;

/**
 * Marks a machine-generated item (Phase 125g decomposition ingest) — drives
 * the "navrhla ZIBBY" badge. A `z.literal` rather than an enum: there is
 * exactly one non-operator origin today, and it widens to `z.enum` later
 * without breaking parsers (same reasoning as `NoteDomainSchema`).
 */
export const RoadmapOriginSchema = z.literal("zibby-decomposed");
export type RoadmapOrigin = z.infer<typeof RoadmapOriginSchema>;

/**
 * The item's position in the delivery loop. `blocked` is deliberately ABSENT
 * from this list — it is derived, never stored (see `roadmap-readiness.ts`).
 * `todo` → `enqueued` on play; `enqueued` → `running` when the gate creates the
 * task; `running` → `awaiting-merge` once a PR artifact lands, or straight to
 * `done` for a document artifact; `awaiting-merge` → `done` on merge;
 * anything that ends without an artifact → `failed`; an item the source stops
 * returning → `archived` (never deleted).
 */
export const RoadmapItemLifecycleSchema = z.enum([
  "todo",
  "enqueued",
  "running",
  "awaiting-merge",
  "done",
  "failed",
  "archived",
]);
export type RoadmapItemLifecycle = z.infer<typeof RoadmapItemLifecycleSchema>;

/**
 * One run's outcome as recorded on the item, distinct from `RunStatusSchema`
 * (which describes an agent/skill/pipeline run in general). Kept intentionally
 * tight — only the four states a roadmap run can actually be in from the
 * item's point of view: `running` (the task the gate created hasn't finished
 * yet), `awaiting-merge` (it finished and produced a PR artifact, not yet
 * merged), `done` (this run is what closed the item — PR merged, or a
 * successful document run), `failed` (it finished with no artifact, or
 * errored). Deliberately excludes `todo`/`enqueued`/`archived`: those describe
 * the ITEM before/after a run exists, never a run record itself.
 */
export const RoadmapRunOutcomeSchema = z.enum(["running", "awaiting-merge", "done", "failed"]);
export type RoadmapRunOutcome = z.infer<typeof RoadmapRunOutcomeSchema>;

/**
 * One dispatch of a roadmap item to the task pipeline (Phase 125e writes
 * these; the shape lands now per D-005). `runRef` is the run id once the task
 * starts running (a `ScheduledTask` may be created before its run exists);
 * `prNumber`/`prUrl` are set once the terminal PR artifact lands;
 * `artifactPath` records a document artifact's path instead.
 */
export const RoadmapItemRunSchema = z.object({
  taskId: z.string().min(1),
  runRef: z.string().min(1).optional(),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().optional(),
  artifactPath: z.string().min(1).optional(),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.optional(),
  outcome: RoadmapRunOutcomeSchema,
});
export type RoadmapItemRun = z.infer<typeof RoadmapItemRunSchema>;

/**
 * A roadmap item: an epic or a task, imported from Jira/GitHub or created
 * manually. One file per item on disk (`<projectId>/<itemId>.json`) — see
 * `RoadmapStore`. `blocked` is intentionally NOT a field here — it is always
 * derived from `dependsOn` + `overrideBlocked` (see `roadmap-readiness.ts`),
 * so it can never go stale.
 *
 * Ownership split on re-sync (125b): the source owns `name`, `description`,
 * `externalLevel`, `attachments`, `source.url`, `parentId`, and
 * `dependsOnFromSource`. ZIBBY owns `lifecycle`, `runs`, `overrideBlocked`,
 * `origin`, and any edge in `dependsOn` that is not in `dependsOnFromSource`.
 * A re-sync never touches the second group.
 */
export const RoadmapItemSchema = z.object({
  id: RoadmapItemIdSchema,
  projectId: ProjectIdSchema,
  level: RoadmapItemLevelSchema,
  /** The epic id this task belongs to. Absent for an epic, or an unparented task. */
  parentId: RoadmapItemIdSchema.optional(),
  name: z.string().min(1).max(512),
  /** Markdown body. */
  description: z.string().default(""),
  source: RoadmapSourceSchema,
  /** Raw source level ("Story", "Sub-task", "Milestone") — feeds the level-mapping table + re-sync. */
  externalLevel: z.string().min(1).optional(),
  /** The uploaded/imported attachment set this item references, if any. */
  attachmentSetId: z.string().min(1).optional(),
  /** Durable, displayable metadata for the referenced set (empty when none). */
  attachments: z.array(AttachmentSchema).default([]),
  /** Every roadmap item id this item depends on — the union ZIBBY sees and gates on. */
  dependsOn: z.array(RoadmapItemIdSchema).default([]),
  /** The subset of `dependsOn` the source owns; a re-sync may rewrite ONLY these. */
  dependsOnFromSource: z.array(RoadmapItemIdSchema).default([]),
  /** Tier-3 "pustit i tak" — dispatch even while a dependency isn't done. */
  overrideBlocked: z.boolean().optional(),
  /** Set by the Phase 125g decomposition ingest; cleared on any operator edit. */
  origin: RoadmapOriginSchema.optional(),
  /**
   * 125e — the terminal output the gate asks the created task for. Absent =
   * the plan's default, `{ type: "pr" }`; an operator may set this to
   * `{ type: "file", ... }` for a research/document item that can never be
   * merged (see the lifecycle: a `file` output item goes straight to `done`
   * on a successful run, never `awaiting-merge`). Operator-owned, editable via
   * `UpdateRoadmapItemSchema`, same ownership class as `overrideBlocked`.
   */
  output: TaskOutputSchema.optional(),
  lifecycle: RoadmapItemLifecycleSchema,
  /**
   * Stamped by `play`/`playBulk`/`restart` at the moment an item becomes
   * `enqueued` — the gate drains a project's enqueued items strictly FIFO by
   * this timestamp (never `updatedAt`, which also moves on unrelated edits
   * like a re-sync touching `description`). Cleared implicitly once the gate
   * releases the item (a `running`/later item's ordering no longer matters).
   */
  enqueuedAt: IsoDateTimeSchema.optional(),
  runs: z.array(RoadmapItemRunSchema).default([]),
  /**
   * Sync-machinery-owned (125b), NOT part of the source/ZIBBY ownership split
   * above: short diagnostic notes about the most recent sync — today, only
   * "attachment X skipped (exceeds the size/count cap)". Recomputed WHOLESALE
   * on every sync (never merged with a prior value) and never operator-
   * editable; empty once nothing was skipped. Kept on the item (rather than
   * only in the sync endpoint's response) because a cap can silently keep
   * biting on every re-sync — the note needs to be visible on the card/detail
   * dialog later (125d), not just in a one-off API response nobody reads twice.
   */
  syncNotes: z.array(z.string()).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Last time a sync tick (125b) wrote this item from its source. Absent for manual items. */
  syncedAt: IsoDateTimeSchema.optional(),
});
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

/**
 * Manual creation input ("Nový epik" / "Nový task", 125f). Only what an
 * operator supplies — `id` is minted server-side, `source.kind` is forced to
 * `"manual"`, and every ZIBBY/source-owned field (`lifecycle`, `runs`,
 * `attachments`, `origin`, `dependsOnFromSource`, timestamps) is server-set.
 */
export const CreateRoadmapItemSchema = z.object({
  level: RoadmapItemLevelSchema,
  name: z.string().min(1).max(512),
  description: z.string().optional().default(""),
  parentId: RoadmapItemIdSchema.optional(),
  dependsOn: z.array(RoadmapItemIdSchema).optional().default([]),
  overrideBlocked: z.boolean().optional(),
});
export type CreateRoadmapItemInput = z.infer<typeof CreateRoadmapItemSchema>;

/**
 * Edit input (125f dependency editing + the detail dialog). Deliberately NOT
 * `RoadmapItemSchema.partial()`: `lifecycle` is never operator-editable (the
 * gate/run machinery owns it exclusively — see the lifecycle diagram), and
 * `source`/`externalLevel`/`attachments`/`runs`/`syncedAt`/timestamps are
 * either source- or ZIBBY-owned and would otherwise be settable to an
 * arbitrary value by a client. `parentId: null` is the explicit "clear"
 * signal (`undefined` can't survive JSON transport, so a real removal needs a
 * value that serializes — same convention as `UpdateAgentSchema.avatar`).
 */
export const UpdateRoadmapItemSchema = z.object({
  name: z.string().min(1).max(512).optional(),
  description: z.string().optional(),
  level: RoadmapItemLevelSchema.optional(),
  parentId: RoadmapItemIdSchema.nullable().optional(),
  dependsOn: z.array(RoadmapItemIdSchema).optional(),
  overrideBlocked: z.boolean().optional(),
  /** The gate's terminal output choice for this item's task (125e) — see the field's own docblock. */
  output: TaskOutputSchema.optional(),
});
export type UpdateRoadmapItemInput = z.infer<typeof UpdateRoadmapItemSchema>;

/**
 * Per-project roadmap config (`<projectId>/_config.json`): the two automation
 * toggles, both surfaced on the project's Integrations tab ("Automatizace
 * roadmapy"). Independent of each other — `autoPlay` without `autoSync` simply
 * works through whatever the operator synced by hand.
 *
 * Both default to `false`: a fresh project's roadmap neither polls third-party
 * issues nor dispatches work on its own until the operator opts in per project.
 * That opt-in is what licenses the tick to dispatch at all — see
 * `RoadmapGateService`'s docblock for the full provenance rule.
 */
export const RoadmapConfigSchema = z.object({
  autoSync: z.boolean().default(false),
  /**
   * Auto-pickup (`RoadmapTickService`): every tick, enqueue every unblocked
   * `todo` TASK and dispatch a decomposition for every childless epic that has
   * never been decomposed. How many of those actually start at once is capped
   * by `systemConfig.maxConcurrentRoadmapRuns`, not here.
   */
  autoPlay: z.boolean().default(false),
});
export type RoadmapConfig = z.infer<typeof RoadmapConfigSchema>;
/** Pre-defaults shape — what a full-replace writer may hand in (see `RoadmapStore.writeConfig`). */
export type RoadmapConfigInput = z.input<typeof RoadmapConfigSchema>;

/**
 * The PATCH shape `PUT /roadmap/config` accepts: an omitted toggle means
 * "leave it alone", so a control that only knows about one toggle can never
 * reset the other (see the route's comment in `roadmap.contract.ts`).
 *
 * Spelled out rather than derived as `RoadmapConfigSchema.partial()` — under
 * Zod 4 an optional field whose inner type carries a `.default()` STILL
 * materialises that default for a missing key, so `.partial()` would hand the
 * handler `{ autoSync: true, autoPlay: false }` for a body of
 * `{ autoSync: true }` and clobber the very toggle it was meant to preserve.
 * The defaults belong to {@link RoadmapConfigSchema} (the stored shape); a
 * patch has no defaults at all, by construction.
 */
export const RoadmapConfigPatchSchema = z
  .object({ autoSync: z.boolean(), autoPlay: z.boolean() })
  .partial();
export type RoadmapConfigPatch = z.infer<typeof RoadmapConfigPatchSchema>;
