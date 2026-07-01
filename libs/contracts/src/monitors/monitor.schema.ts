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
  detail: z.string(),
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
