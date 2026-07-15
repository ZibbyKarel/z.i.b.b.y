import { z } from "zod";

/**
 * Shared error body for 4xx responses, used across multiple resource contracts
 * (agents, agent-runs, categories). Kept in a cross-domain `common` module rather
 * than any single resource's schema file so no domain has to reach into another's
 * just for the error shape.
 */
export const ErrorSchema = z.object({ message: z.string() });
export type ErrorBody = z.infer<typeof ErrorSchema>;

/**
 * An ISO 8601 date-time string (e.g. `2026-06-28T04:30:00Z`). The single shape
 * for every timestamp field across the contracts — `startedAt`, `createdAt`,
 * `lastSyncAt`, … — so the validation rule lives in one place. Chain `.optional()`
 * / `.nullable()` at the use site as before.
 */
export const IsoDateTimeSchema = z.string().datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * The shared lifecycle states a run can be in, across every run kind (agent,
 * skill, pipeline stage). Two *safe paused states with no live child* — each
 * survives a restart unchanged rather than being reconciled to `interrupted`:
 * - `awaiting-approval` (Phase 3): the runner created an approval and will not
 *   perform the gated action until a decision arrives.
 * - `paused-limit` (Phase 9): the run's child died on a subscription usage limit;
 *   it is a *pause, not a failure* — it does not burn retry budget, carries a
 *   persisted `resumeAt`, and auto-resumes when the window resets. Modeled on
 *   `awaiting-approval` (a stashed spawn spec gives restart survival + respawn).
 */
export const RunStatusSchema = z.enum([
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
  "paused-limit",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * Risk hint carried in agent/skill frontmatter. Display-only from Phase 3.5 on
 * (the gate policy engine decides; `risk` only colours the UI badge).
 */
export const RiskSchema = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof RiskSchema>;

/**
 * The git worktree a run owns (Phase 3.1). A project-targeted run works on its own
 * branch in a dedicated worktree under the run dir, never the operator's main
 * checkout: `branch` is `zibby/<runId>-<slug>`, `path` the worktree directory, and
 * `baseRef` the HEAD it was cut from (the diff base for the PR-gate diffstat).
 * Optional on the run records — a non-git (or projectless) run carries none and
 * falls back to the Phase 2 direct-checkout cwd.
 */
export const WorkspaceSchema = z.object({
  branch: z.string().min(1),
  path: z.string().min(1),
  baseRef: z.string().min(1),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * Max length of an avatar/logo data URI, the storage backstop. Sized so a 2 MB image
 * fits: 2 MB → ~2.8 M base64 chars, and we allow up to 2,900,000 for the data-URI
 * prefix + headroom. (The API body-parser limit in `main.ts` must stay above this.)
 */
export const AVATAR_MAX = 2_900_000;

/**
 * An entity avatar: either an uploaded `data:image/*` URI or a `/`-rooted path to
 * a bundled static asset (`/avatars/architect.png`). Anything else — notably an
 * external `http(s)://` URL — is rejected, so inbound data can never point the UI
 * at a fetch it shouldn't make.
 */
export const AvatarSchema = z
  .string()
  .max(AVATAR_MAX)
  .refine((v) => v.startsWith("data:image/") || (v.startsWith("/") && !v.startsWith("//")), {
    message: "avatar must be a data:image/ URI or a root-relative path",
  });

/**
 * The shared shape of a DELETE response: the deleted entity's `id`, echoed back
 * so the caller can confirm what was removed (and web mutation hooks read `.id`
 * for cache invalidation). Reused across every resource's `deleteX` route
 * instead of each contract hand-rolling its own `{ id: <IdSchema> }` literal —
 * they were already structurally identical (T11 dedup, finding #9).
 */
export const DeleteResponseSchema = z.object({ id: z.string() });
export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

/**
 * The shared "no body, or an empty object" idiom used by every action-style
 * route that takes no real input (`trigger`, `clone`, `run`, …). ts-rest still
 * wants a schema on `body` to accept a request with no `Content-Type`/empty
 * JSON object; this is that schema, reused instead of each contract repeating
 * the same `z.object({}).optional()` literal (T11 dedup, finding #37).
 */
export const EmptyBodySchema = z.object({}).optional();

/**
 * One run artifact: its name and text content. Shared by every run kind's
 * artifact endpoint (task runs, pipeline runs, …) — they were already
 * byte-identical `{ name: z.string(), content: z.string() }` shapes, each
 * kind's own storage/allowlist layer still enforces which names are valid
 * (T11 dedup, finding #29).
 */
export const RunArtifactSchema = z.object({ name: z.string(), content: z.string() });
export type RunArtifact = z.infer<typeof RunArtifactSchema>;
