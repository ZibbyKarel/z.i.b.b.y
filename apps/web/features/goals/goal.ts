import type { GoalIteration, TaskRunStatus } from "@zibby/contracts";
import type { StateTone } from "@zibby/design-system";

/**
 * A goal (loop definition) has no state of its own — the state shown on a
 * {@link GoalCard} / the detail header is its latest run's `TaskRunStatus`, or
 * `idle` when the goal has never run. A goal run's status is drawn from the
 * shared `RunStatus` set plus `parked`/`paused-limit` (never `scheduled`/`held`/
 * `queued`/`pending`/`awaiting-approval`, which don't apply to a goal). Maps onto
 * the canonical {@link StateTone} vocabulary (DS.md §2.2) the same way
 * `runStateTone` narrows the legacy tone set.
 */
export function goalStateTone(status: TaskRunStatus | undefined): StateTone {
  switch (status) {
    case "running":
      return "working";
    case "paused-limit":
      return "thinking";
    case "parked":
      return "blocked";
    case "error":
      return "error";
    case "done":
      return "done";
    case "interrupted":
    case undefined:
    default:
      return "idle";
  }
}

/**
 * The one-line summary of a goal run's latest iteration — the mock's `{{ g.iter }}`
 * line, e.g. `"Iteration 3 · verifier failed"`. `undefined` when there is no
 * iteration yet (a run that hasn't started its first maker pass).
 */
export function latestIterationSummary(iterations: readonly GoalIteration[]): string | undefined {
  const last = iterations[iterations.length - 1];
  if (!last) return undefined;
  const outcome =
    last.status === "running" ? "running" : last.verifier.satisfied ? "passed" : "failed";
  return `Iteration ${last.index + 1} · verifier ${outcome}`;
}
