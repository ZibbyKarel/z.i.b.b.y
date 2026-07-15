import { z } from "zod";

/**
 * The closed vocabulary of monitor events (N3). A monitor watches STATUS, not
 * conversation — its events are alerts about the world (a red build), never
 * messages to reply to. New kinds (e.g. a Sentry `error-spike`) are added here
 * explicitly, the same growth discipline as the activity kinds.
 */
export const MonitorEventKindSchema = z.enum(["ci-run-failed"]);
export type MonitorEventKind = z.infer<typeof MonitorEventKindSchema>;

/**
 * An event's handling state: `new` (ingested, not yet acted on), `handled`
 * (ZIBBY dispatched the investigation task recorded in `taskId`), `ignored`
 * (operator dismissed it).
 */
export const MonitorEventStateSchema = z.enum(["new", "handled", "ignored"]);
export type MonitorEventState = z.infer<typeof MonitorEventStateSchema>;

/**
 * One monitor alert, persisted as a JSON file (files are the source of truth).
 * The `id` is deterministic per source occurrence (GitHub CI:
 * `ci-<repo>-<runId>-<attempt>`), so a re-poll is a pure dedup hit — replay-safe
 * like channel items. `taskId` links the investigation task the alert dispatched
 * (the tier path: a fix ends at the structural PR gate like any other run).
 */
export const MonitorEventSchema = z.object({
  id: z.string().min(1),
  integrationId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  kind: MonitorEventKindSchema,
  /** One-line, human-readable: "CI red: build.yml #123 failed on main". */
  title: z.string().min(1),
  /** Longer context (workflow, branch, sha, conclusion) — data, never commands. */
  detail: z.string().max(4000),
  /** Deep link to the source (the workflow run page). */
  url: z.string().optional(),
  occurredAt: z.string().datetime(),
  state: MonitorEventStateSchema,
  taskId: z.string().optional(),
});
export type MonitorEvent = z.infer<typeof MonitorEventSchema>;

/** Filters for listing monitor events (default: everything, newest-first). */
export const MonitorEventsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  state: MonitorEventStateSchema.optional(),
});
export type MonitorEventsQuery = z.infer<typeof MonitorEventsQuerySchema>;

/**
 * CI health is STATE, not an event (N4b): the last known red/green of one watched
 * source, refreshed every monitor tick and persisted as a sidecar file. The
 * briefing and the project-detail chip read this — a state line exists while the
 * state lasts and disappears on its own, so there are no redundant re-alerts
 * (events stay the alert path; see `MonitorEventSchema`).
 */
export const CiStatusStateSchema = z.enum(["red", "green"]);
export type CiStatusState = z.infer<typeof CiStatusStateSchema>;

export const CiStatusSchema = z.object({
  integrationId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  /** The adapter that computed it (e.g. "github-ci") — one status per pair. */
  adapterKind: z.string().min(1),
  state: CiStatusStateSchema,
  /** When the current streak began (oldest same-state run in the fetched page). */
  sinceAt: z.string().datetime(),
  /** When the monitor last confirmed this state. */
  checkedAt: z.string().datetime(),
  /** One-line context: which workflow/branch decided the state. */
  summary: z.string(),
  /** Deep link to the deciding run. */
  url: z.string().optional(),
});
export type CiStatus = z.infer<typeof CiStatusSchema>;

/** Filters for listing CI statuses (default: every watched source). */
export const CiStatusQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
});
export type CiStatusQuery = z.infer<typeof CiStatusQuerySchema>;
