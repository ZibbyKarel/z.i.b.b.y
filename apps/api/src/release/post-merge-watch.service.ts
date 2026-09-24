import { Injectable, Optional } from "@nestjs/common";
import type { MergeWatch } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { HandoffService } from "../handoff/handoff.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { MonitorEventStore } from "../monitors/monitor-event.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { MergeWatchStore } from "./merge-watch.store";

const GITHUB_API = "https://api.github.com";

interface GitHubCheckRun {
  status?: string;
  conclusion?: string | null;
}
interface GitHubCheckRunsResponse {
  check_runs?: GitHubCheckRun[];
}

type CiRollup = "passing" | "failing" | "pending";

/** Roll up GitHub's check-runs list to one verdict. `pending` on no data (fail-open — never resolves a bare empty list to green or red). */
function rollupCheckState(runs: GitHubCheckRun[]): CiRollup {
  if (runs.length === 0) return "pending";
  if (runs.some((r) => r.status !== "completed")) return "pending";
  const FAILING = new Set(["failure", "cancelled", "timed_out", "action_required"]);
  if (runs.some((r) => r.conclusion && FAILING.has(r.conclusion))) return "failing";
  return "passing";
}

/**
 * NS2 F7b-2 — the merge loop's tail. Polls every `watching` {@link MergeWatch}
 * (one per operator merge that produced a sha) and resolves it within its bounded
 * `deadline` window:
 *
 * - past deadline → `expired` (CI never confirmed in time — recorded, no task).
 * - CI passing → `green` (silent Tier-1, celebrated only in the briefing).
 * - CI failing → a `post-merge-red` signal handed to the {@link HandoffService}
 *   rule engine (A3) — the seed rule still dispatches a gated fix task through
 *   the ordinary scheduler (Tier-2 act-then-report, ends at the structural PR
 *   gate like any other run) — `red`, `taskId` linked when a task dispatched.
 * - CI pending/unknown → `attempts` increments, stays `watching` for the next tick.
 *
 * **This service performs NO merge, push, or deploy call of any kind** — it only
 * reads GitHub check-runs and hands a signal to `HandoffService`, exactly the
 * monitor watcher's tier path. Per-watch try/catch: one failing watch never
 * blocks the others, and a signal that doesn't dispatch (`evaluate` is
 * fail-open — `{ action: "none" }`) leaves the watch `watching` for the next
 * tick (never lost).
 */
@Injectable()
export class PostMergeWatchService {
  private readonly fetchImpl: typeof fetch;
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: MergeWatchStore,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly monitorEvents: MonitorEventStore,
    private readonly handoff: HandoffService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.log = logger.child(PostMergeWatchService.name);
  }

  async poll(now: Date = new Date()): Promise<{ resolved: number }> {
    const watching = await this.store.listWatching();
    let resolved = 0;
    for (const watch of watching) {
      try {
        if (await this.resolveOne(watch, now)) resolved++;
      } catch (err) {
        this.log.warn("post-merge watch poll failed — stays watching", {
          id: watch.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { resolved };
  }

  /** Resolve one watch; returns true when it left the `watching` state. */
  private async resolveOne(watch: MergeWatch, now: Date): Promise<boolean> {
    if (now >= new Date(watch.deadline)) {
      await this.store.patch(watch.id, { state: "expired" });
      void this.activity.record({
        kind: "post-merge-outcome",
        summary: `Post-merge CI window expired: PR #${watch.prNumber} in ${watch.repo}`,
        refs: { projectId: watch.projectId, itemId: `pr-${watch.prNumber}` },
      });
      return true;
    }

    const project = await this.projects.get(watch.projectId).catch(() => null);
    if (!project) return false; // project gone — fail-open, leave watching until deadline
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) return false; // no token — fail-open, retry next tick

    const rollup = await this.rollup(link, watch);

    if (rollup === "passing") {
      await this.store.patch(watch.id, { state: "green" });
      void this.activity.record({
        kind: "post-merge-outcome",
        summary: `CI green after merge: PR #${watch.prNumber} in ${watch.repo}`,
        refs: { projectId: watch.projectId, itemId: `pr-${watch.prNumber}` },
      });
      return true;
    }

    if (rollup === "failing") {
      return this.dispatchFix(watch);
    }

    // pending/unknown — keep watching, one more attempt logged.
    await this.store.patch(watch.id, { attempts: watch.attempts + 1 });
    return false;
  }

  /**
   * Prefer the monitor watcher's CI-status sidecar when it clearly covers this
   * merge (same project, snapshotted at/after the merge — so it necessarily
   * reflects the target branch's post-merge state) — avoids a redundant GitHub
   * call. Otherwise fetch the merged sha's check-runs directly.
   */
  private async rollup(
    link: { repo: string; token: string },
    watch: MergeWatch,
  ): Promise<CiRollup> {
    const statuses = await this.monitorEvents
      .listStatuses({ projectId: watch.projectId })
      .catch(() => []);
    const sidecar = statuses.find((s) => s.checkedAt >= watch.mergedAt);
    if (sidecar) return sidecar.state === "green" ? "passing" : "failing";

    try {
      const res = await this.fetchImpl(
        `${GITHUB_API}/repos/${link.repo}/commits/${watch.sha}/check-runs`,
        {
          headers: {
            authorization: `Bearer ${link.token}`,
            accept: "application/vnd.github+json",
          },
        },
      );
      if (!res.ok) return "pending";
      const body = (await res.json().catch(() => null)) as GitHubCheckRunsResponse | null;
      return rollupCheckState(body?.check_runs ?? []);
    } catch (err) {
      this.log.debug("post-merge check-runs fetch failed", {
        repo: link.repo,
        sha: watch.sha,
        error: err instanceof Error ? err.message : String(err),
      });
      return "pending";
    }
  }

  /**
   * Hand a `post-merge-red` signal to the handoff rule engine on a red verdict
   * — the tier path, never a merge/push directly. `evaluate` is fail-open: a
   * dispatch failure (or no matching rule) resolves to `{ action: "none" }`,
   * not a throw, so the try/catch here is belt-and-suspenders.
   */
  private async dispatchFix(watch: MergeWatch): Promise<boolean> {
    try {
      const outcome = await this.handoff.evaluate({
        from: "maestro",
        kind: "post-merge-red",
        projectId: watch.projectId,
        title: `Post-merge red: #${watch.prNumber}`,
        body: `The target branch's CI failed after merging PR #${watch.prNumber} (${watch.prTitle}) in ${watch.repo} at sha ${watch.sha}.\n\nInvestigate the failing CI run and prepare a fix on its own branch. Do not push or merge — the PR is the gate.`,
        fingerprint: `pm-red-${watch.id}`,
      });
      if (outcome.action !== "dispatched") {
        // No rule matched / dispatch failed fail-open — mirror today's "dispatch
        // failed → stays watching" behavior so the next tick retries.
        this.log.warn("post-merge handoff did not dispatch — watch stays watching", {
          id: watch.id,
          outcome: outcome.action,
        });
        return false;
      }
      const taskId = outcome.runRef;
      await this.store.patch(watch.id, { state: "red", taskId });
      void this.activity.record({
        kind: "post-merge-outcome",
        summary: `CI red after merge: PR #${watch.prNumber} in ${watch.repo} — fix task dispatched`,
        refs: { projectId: watch.projectId, itemId: `pr-${watch.prNumber}`, taskId },
      });
      return true;
    } catch (err) {
      // Dispatch failed — the watch stays `watching`; the next tick retries.
      this.log.warn("post-merge fix dispatch failed — watch stays watching", {
        id: watch.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
