import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ORCHESTRATOR_ID, ORCHESTRATOR_TARGET } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import { getApprovalsQueryKey } from "../../approvals/queries/useApprovalsQuery";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useRunEventsConnected } from "../runEvents";
import type { RunView } from "../run";
import { allTaskRunsKey } from "./keys";

// Re-exported so existing deep importers keep resolving the key from here; the
// canonical home is the dependency-free `./keys` module (see its header).
export { allTaskRunsKey };

const POLL_MS = 2_000;

/** A feed row that is still progressing — a live run (`running`/`awaiting-approval`/
 * `parked`) or a still-waiting `scheduled` task whose due time can arrive any moment.
 * Both ride the one feed now, so one gate covers them. */
const LIVE_STATES = new Set(["running", "pending", "awaiting-approval", "parked", "scheduled"]);

/** Keep polling while anything is still live/waiting; otherwise idle (the final poll
 * still catches the done transition). The cache holds the raw `{ status, body }`
 * envelope — `select` doesn't run on it — so read the rows off `.body`. */
function pollWhileLive(query: {
  state: { data?: { body?: ReadonlyArray<{ status: string }> } };
}): number | false {
  const runs = query.state.data?.body ?? [];
  return runs.some((r) => LIVE_STATES.has(r.status)) ? POLL_MS : false;
}

/**
 * The unified runs feed. One query against `GET /api/tasks/runs` — the server merges
 * the per-kind run histories with the still-waiting scheduled tasks (and folds a
 * goal's maker/verifier child runs out), so the client no longer merges anything.
 *
 * Freshness is push-driven via the `/api/events` SSE channel, which invalidates the
 * feed key on every run transition. The self-gating poll (refetch while any row is
 * `running`/`awaiting-approval`/`parked`/`scheduled`) is kept only as the fallback
 * for when the stream is down — `refetchInterval` is `false` while it's connected.
 *
 * Returns `runs` alongside the query's own `isPending`/`isError`/`refetch` (Phase
 * 18.2) — a `?? []` default alone swallowed the load state, so a failed fetch used
 * to read as an honestly-empty feed rather than an outage. `runs` itself keeps its
 * existing `{ runs }` shape (many call sites destructure just that) — the smallest
 * safe change is additive, not a switch to returning the query result directly.
 */
export function useRunsQuery(): {
  runs: RunView[];
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
} {
  const streamConnected = useRunEventsConnected();
  const query = apiClient.taskRuns.listTaskRuns.useQuery({
    queryKey: allTaskRunsKey,
    refetchInterval: streamConnected ? false : pollWhileLive,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });

  const runs = useMemo<RunView[]>(() => query.data ?? [], [query.data]);

  // The 2s runs poll is the freshest signal that a run has paused at a gate, so
  // when one *enters* `awaiting-approval` we refetch the pending-approval queue
  // immediately rather than waiting out its own 60s fallback poll. Edge-detect by
  // run id (not count) so a run re-entering the state at a later gate still fires.
  const qc = useQueryClient();
  const awaitingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const awaiting = new Set(
      runs.filter((r) => r.status === "awaiting-approval").map((r) => r.runId),
    );
    const entered = [...awaiting].some((id) => !awaitingRef.current.has(id));
    awaitingRef.current = awaiting;
    if (entered) void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
  }, [runs, qc]);

  return { runs, isPending: query.isPending, isError: query.isError, refetch: query.refetch };
}

/** Build the owner-id → glyph map from the skill/agent catalogs (for run cards). */
export function useRunGlyphMap(): Map<string, IconName> {
  const skills = apiClient.skills.listSkills.useQuery({
    queryKey: ["skills"],
    select: selectApiResponseBody,
  });
  const agents = apiClient.agents.listAgents.useQuery({
    queryKey: ["agents"],
    select: selectApiResponseBody,
  });
  return useMemo(() => {
    const map = new Map<string, IconName>();
    // The orchestrator is synthetic (never in the catalogs); its run rows carry
    // the reserved owner id, so seed its glyph from the contract constant.
    map.set(ORCHESTRATOR_ID, ORCHESTRATOR_TARGET.glyph as IconName);
    for (const s of skills.data ?? []) if (s.glyph) map.set(s.id, s.glyph as IconName);
    for (const a of agents.data ?? []) if (a.glyph) map.set(a.id, a.glyph as IconName);
    return map;
  }, [skills.data, agents.data]);
}

/**
 * Build the owner-id → avatar map from the agent + pipeline catalogs (Phase 48 —
 * the run-detail header shows the assigned entity's avatar, with the glyph as the
 * fallback). Only agents and pipelines carry an `avatar` in their schemas, so they
 * are the only sources here; skills have no avatar field. Reuses the same query keys
 * as the glyph/pipeline catalogs so it shares their cache (no extra fetch).
 */
export function useRunAvatarMap(): Map<string, string> {
  const agents = apiClient.agents.listAgents.useQuery({
    queryKey: ["agents"],
    select: selectApiResponseBody,
  });
  const pipelines = apiClient.pipelines.listPipelines.useQuery({
    queryKey: ["pipelines"],
    select: selectApiResponseBody,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents.data ?? []) if (a.avatar) map.set(a.id, a.avatar);
    for (const p of pipelines.data ?? []) if (p.avatar) map.set(p.id, p.avatar);
    return map;
  }, [agents.data, pipelines.data]);
}
