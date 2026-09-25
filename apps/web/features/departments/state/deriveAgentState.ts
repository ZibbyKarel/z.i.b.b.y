import type { StateTone } from "@zibby/design-system";

/**
 * The subset of a run's shape {@link deriveAgentState} needs — kept minimal (not
 * `RunView`/`TaskRun`) so this stays a pure, dependency-free function callable from
 * anywhere (the org map's COO node has no "employee" to read a server-derived state
 * off, unlike a department's roster — see `EmployeeWithStateSchema.state`).
 */
export interface AgentStateRun {
  status:
    | "running"
    | "queued"
    | "scheduled"
    | "pending"
    | "held"
    | "awaiting-approval"
    | "paused-limit"
    | "done"
    | "error"
    | "interrupted"
    | "parked";
  /** ISO timestamp the run last changed state — the done/error recency windows key off this. */
  endedAt?: string;
}

/** O-04's recency windows (`docs/plans/zibbycorp/OPEN-QUESTIONS.md`). */
const ERROR_WINDOW_MS = 60 * 60 * 1000;
const DONE_WINDOW_MS = 10 * 60 * 1000;

function isWithin(endedAt: string | undefined, windowMs: number, now: number): boolean {
  if (endedAt === undefined) return false;
  const ts = new Date(endedAt).getTime();
  return Number.isFinite(ts) && now - ts <= windowMs;
}

/**
 * O-04 — the six agent states have no backend enum; this is the one pure function
 * that derives one from a run history + a queued flag (`docs/plans/zibbycorp/
 * OPEN-QUESTIONS.md` O-04 mapping table):
 *
 *   working → a `running` run
 *   blocked → `awaiting-approval` or `paused-limit`
 *   error   → `error`/`interrupted` within the last 60 min
 *   done    → `done` within the last 10 min
 *   thinking → queued/pending, no run yet
 *   idle    → anything else
 *
 * Checked in that priority order (a currently-running run always wins; a stale
 * error/done outside its window falls through to idle/thinking).
 */
export function deriveAgentState(
  runs: readonly AgentStateRun[],
  queued: boolean,
  now: Date = new Date(),
): StateTone {
  if (runs.some((r) => r.status === "running")) return "working";
  if (runs.some((r) => r.status === "awaiting-approval" || r.status === "paused-limit")) {
    return "blocked";
  }
  const nowMs = now.getTime();
  if (
    runs.some(
      (r) =>
        (r.status === "error" || r.status === "interrupted") &&
        isWithin(r.endedAt, ERROR_WINDOW_MS, nowMs),
    )
  ) {
    return "error";
  }
  if (runs.some((r) => r.status === "done" && isWithin(r.endedAt, DONE_WINDOW_MS, nowMs))) {
    return "done";
  }
  if (queued) return "thinking";
  return "idle";
}
