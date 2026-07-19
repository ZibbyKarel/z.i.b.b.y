import type { TaskRunStatus } from "@zibby/contracts";
import type { IconName, StatTone } from "@zibby/design-system";

/**
 * The eleven run states folded into five operator-facing buckets — the shared
 * vocabulary the project run-summary tiles and their deep-links into `/archiv`
 * (F8d — `/runs` is deleted) use. Order reads the lifecycle: live → waiting →
 * done → failed → parked.
 *
 * Every {@link TaskRunStatus} belongs to exactly one bucket (exhaustiveness is
 * asserted in the test), so a bucket's `statuses` — joined by `,` — is a
 * complete `?filter=` deep-link intended to reproduce the bucket on the runs
 * screen — though as of F8d, `/archiv` doesn't yet read `?filter=`/`?project=`
 * (a pre-existing F2 gap; see `ProjectCard`/`ProjectRunSummary`), so today it
 * lands inert rather than 404ing.
 */
export type RunStatusGroupKey = "running" | "waiting" | "done" | "error" | "parked";

export interface RunStatusGroup {
  /** i18n key suffix under `runs.group.*`, and the deep-link's logical bucket. */
  key: RunStatusGroupKey;
  /** The member states — the exact set a `?filter=` link expands to. */
  statuses: TaskRunStatus[];
  /** Tile tone when the bucket is non-empty; empty buckets render `neutral`. */
  tone: StatTone;
  icon: IconName;
}

export const RUN_STATUS_GROUPS: readonly RunStatusGroup[] = [
  { key: "running", statuses: ["running"], tone: "accent", icon: "run" },
  {
    key: "waiting",
    statuses: ["queued", "scheduled", "pending", "held", "awaiting-approval"],
    tone: "warn",
    icon: "wait",
  },
  { key: "done", statuses: ["done"], tone: "ok", icon: "ok" },
  { key: "error", statuses: ["error", "interrupted", "paused-limit"], tone: "bad", icon: "warn" },
  { key: "parked", statuses: ["parked"], tone: "warn", icon: "pause" },
];

/** The `?filter=` value that reproduces a bucket on the runs screen. */
export function groupFilterParam(group: RunStatusGroup): string {
  return group.statuses.join(",");
}
