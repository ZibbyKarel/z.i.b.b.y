import { z } from "zod"
import { AgentIdSchema } from "./agent.schema"
import { RunStatusSchema } from "../common.schema"

/**
 * A single execution of an agent. The backend keeps these in an in-memory
 * registry while the spawned process is alive (and briefly after it finishes, so
 * the UI can report the final state); the captured output is persisted to a log
 * file on disk so a frontend reload never loses it.
 *
 * `runId` doubles as the log file's base name — `<agentId>_<startTsMs>_<pid>` —
 * mirroring how an agent's `id` doubles as its on-disk file name. The agent **id**
 * (filesystem-safe) is used, never the optional free-form `name`.
 */
/**
 * `interrupted` is the post-restart reconciliation state: a run whose process was
 * still alive when the backend stopped. The child is a child of the API process,
 * so it died with it and cannot be resumed — on startup the runner relabels any
 * run left "running" (with no live handle) as `interrupted`. `awaiting-approval`
 * is a run paused on an approval gate. A mid-run (Variant B) pause keeps its live
 * child blocking on a decision file, so it does NOT survive restart — on startup a
 * paused run with no stashed spawn spec is likewise reconciled to `interrupted`.
 *
 * Aliased to the shared {@link RunStatusSchema} so every run kind moves in lockstep
 * (widening it is a deliberate, single-point contract change).
 */
export const AgentRunStatusSchema = RunStatusSchema
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>

export const AgentRunSchema = z.object({
  runId: z.string().min(1),
  agentId: AgentIdSchema,
  status: AgentRunStatusSchema,
  /** Progress 0–100, parsed from `PROGRESS <n>` lines the run emits. */
  pct: z.number().min(0).max(100),
  /**
   * Optional short human name for the run, carried from the New Task dialog's title
   * field (presentation only). Defaulted so sidecars written before it existed parse.
   */
  title: z.string().default(""),
  prompt: z.string(),
  /** Human-chosen target project label (presentation only). */
  project: z.string(),
  /**
   * Folder-relative paths of the files the run targets when the user picked a
   * directory instead of a project (presentation only — these are browser
   * `webkitRelativePath` strings, never host-absolute, so they do not drive the
   * sandbox `cwd`). Empty when a project was chosen. Defaulted so sidecars written
   * before this field existed still parse.
   */
  files: z.array(z.string()).default([]),
  /** Absolute working directory the process ran in (its sandbox folder). */
  cwd: z.string(),
  startedAt: z.string().datetime(),
  pid: z.number().int(),
  logFile: z.string(),
})
export type AgentRun = z.infer<typeof AgentRunSchema>

/** Body accepted by `startRun`. */
export const StartRunSchema = z.object({
  prompt: z.string(),
  project: z.string().optional(),
  /** Folder-relative paths when the run targets a directory rather than a project. */
  files: z.array(z.string()).optional(),
  /** Optional short human name for the run (from the New Task dialog's title field). */
  title: z.string().max(200).optional(),
})
export type StartRunInput = z.infer<typeof StartRunSchema>

/**
 * A slice of a run's log, read from a byte `offset`. The client appends `content`
 * and advances its offset to `nextOffset`; `done` flips true once the process has
 * exited and no more output will arrive.
 */
export const RunLogChunkSchema = z.object({
  content: z.string(),
  nextOffset: z.number().int().nonnegative(),
  done: z.boolean(),
})
export type RunLogChunk = z.infer<typeof RunLogChunkSchema>
