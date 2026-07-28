import { z } from "zod";
import type { ActivityKind } from "./activity.schema";

/**
 * The activity log's display **groups** (Phase: RightRail live log). The ~30 raw
 * {@link ActivityKind}s are too fine-grained to toggle one by one, so each kind
 * belongs to exactly one operator-facing group; the RightRail's visibility/grouping
 * config is expressed per group. A closed vocabulary, like the kinds themselves —
 * a new group is added here on purpose, never smuggled.
 */
export const ActivityGroupSchema = z.enum([
  "tasks",
  "runs",
  "pipelines",
  "goals",
  "approvals",
  "channels",
  "integrations",
  "briefing",
]);
export type ActivityGroup = z.infer<typeof ActivityGroupSchema>;

/** Every {@link ActivityGroup}, in display order (the Settings section iterates this). */
export const ACTIVITY_GROUPS = ActivityGroupSchema.options;

/**
 * The total map from kind → group. Typed as a full `Record` so adding an
 * {@link ActivityKind} without classifying it fails the compile — the live log can
 * never silently drop an unmapped kind into a default bucket.
 */
export const ACTIVITY_GROUP_OF: Record<ActivityKind, ActivityGroup> = {
  "task-created": "tasks",
  "task-dispatched": "tasks",
  "task-outcome": "tasks",
  "task-held": "tasks",
  "task-queued": "tasks",
  "task-deferred-limit": "tasks",
  "task-dead-lettered": "tasks",
  // Phase 4a (Agent Factory telemetry): the classifier's own escape to the
  // orchestrator — reads with the other task-routing entries.
  "orchestrator-fallback": "tasks",
  "run-started": "runs",
  "run-finished": "runs",
  "run-paused-limit": "runs",
  "run-resumed-limit": "runs",
  "pipeline-started": "pipelines",
  "pipeline-finished": "pipelines",
  "pipeline-parked": "pipelines",
  "stage-verdict": "pipelines",
  // N2b: a chain is pipeline composition — its lifecycle reads with the pipelines.
  "chain-started": "pipelines",
  "chain-advanced": "pipelines",
  "chain-parked": "pipelines",
  "chain-finished": "pipelines",
  "goal-dispatched": "goals",
  "goal-verdict": "goals",
  "goal-parked": "goals",
  "approval-requested": "approvals",
  "approval-approved": "approvals",
  "approval-rejected": "approvals",
  "gate-decision": "approvals",
  "channel-item": "channels",
  "channel-triage": "channels",
  "channel-reply": "channels",
  "channel-approval": "channels",
  "channel-ignored": "channels",
  "channel-noted": "channels",
  "channel-needs-attention": "channels",
  "integration-retry-exhausted": "integrations",
  // N3: a monitor alert rides the integration that watches the source (same PAT/config).
  "monitor-alert": "integrations",
  // NS2 F5a/F5c: Sentinel/Loom's scheduled-scan finding — reads with the other
  // watcher discoveries (monitor-alert) rather than a new group for one kind.
  "subsystem-scan": "integrations",
  "machine-action": "approvals",
  "briefing-generated": "briefing",
  // NS2 F7b-2: the merge loop's head + its post-merge CI outcome — read with the
  // other watcher discoveries (monitor-alert/subsystem-scan) rather than a new
  // group for two kinds.
  "merge-completed": "integrations",
  "post-merge-outcome": "integrations",
  // Handoff A2: a producer→consumer dispatch report — reads with the other
  // watcher discoveries (monitor-alert/subsystem-scan/post-merge-outcome) rather
  // than a new group for one kind.
  handoff: "integrations",
  // Phase 125e: the roadmap gate's own dispatch/outcome entries — reads with the
  // other task-lifecycle entries (task-dispatched/task-outcome) rather than a new
  // group for two kinds.
  "roadmap-item-dispatched": "tasks",
  "roadmap-item-outcome": "tasks",
  // Phase 125h: the auto-sync tick's own import/archive summary — reads with the
  // other watcher discoveries (monitor-alert/merge-completed/post-merge-outcome)
  // rather than a new group for one kind.
  "roadmap-sync": "integrations",
};

/**
 * How a group renders in the live log:
 * - `visible` — every entry as its own line.
 * - `grouped` — consecutive entries of the group collapse into one counted line.
 * - `hidden` — never shown in the rail (still recorded; still on `/runs`).
 */
export const ActivityViewModeSchema = z.enum(["visible", "grouped", "hidden"]);
export type ActivityViewMode = z.infer<typeof ActivityViewModeSchema>;

/**
 * The operator-owned RightRail display config — one mode per group, `.strict()`
 * (Law 4 hygiene: an inbound payload can't smuggle an unknown group key). There is
 * exactly one document; no id, no list (the mandate posture).
 */
export const ActivityViewSchema = z
  .object({
    tasks: ActivityViewModeSchema,
    runs: ActivityViewModeSchema,
    pipelines: ActivityViewModeSchema,
    goals: ActivityViewModeSchema,
    approvals: ActivityViewModeSchema,
    channels: ActivityViewModeSchema,
    integrations: ActivityViewModeSchema,
    briefing: ActivityViewModeSchema,
  })
  .strict();
export type ActivityView = z.infer<typeof ActivityViewSchema>;

/**
 * The seeded default: the operator-actionable groups stay `visible`; the noisier,
 * digest-like ones (`channels`, `briefing`) start `grouped` so the log reads as a
 * clean timeline out of the box. Nothing hidden by default.
 */
export const DEFAULT_ACTIVITY_VIEW: ActivityView = {
  tasks: "visible",
  runs: "visible",
  pipelines: "visible",
  goals: "visible",
  approvals: "visible",
  channels: "grouped",
  integrations: "visible",
  briefing: "grouped",
};
