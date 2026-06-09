import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { IconName } from "@zibby/design-system";
import { getApprovalsQueryKey } from "../../approvals/queries/useApprovalsQuery";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { type RunView, agentRunToView, pipelineRunToView } from "../run";

const POLL_MS = 2_000;

/** Cache keys for the full-history run feeds. Exported so the stop/delete mutations
 * can invalidate exactly what this feed reads. */
export const allAgentRunsKey = ["agentRuns", "all"] as const;
export const allPipelineRunsKey = ["pipelineRuns", "all"] as const;

/** A run state that is still progressing (across every kind: agents/skills use
 * `awaiting-approval`, pipelines use `parked`). */
const LIVE_STATES = new Set(["running", "awaiting-approval", "parked"]);

/** Keep polling while anything is still live; otherwise idle (the final poll still
 * catches the done transition). The cache holds the raw `{ status, body }` envelope
 * — `select` doesn't run on it — so read the runs off `.body`. */
function pollWhileLive(query: {
  state: { data?: { body?: ReadonlyArray<{ status: string }> } };
}): number | false {
  const runs = query.state.data?.body ?? [];
  return runs.some((r) => LIVE_STATES.has(r.status)) ? POLL_MS : false;
}

/**
 * The unified runs feed. There is no cross-kind list endpoint, so this merges the
 * per-kind *full-history* lists (agent + pipeline) client-side, newest first — the
 * history endpoints return finished runs too (read from their on-disk sidecars), so
 * the feed isn't limited to the live retention window. Each underlying query
 * self-gates polling — it keeps refetching while any of its runs is still
 * `running`/`awaiting-approval`, idling otherwise.
 */
export function useRunsQuery(): { runs: RunView[] } {
  const agents = apiClient.agentRuns.listRuns.useQuery({
    queryKey: allAgentRunsKey,
    refetchInterval: pollWhileLive,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
  const pipelines = apiClient.pipelineRuns.listAllPipelineRuns.useQuery({
    queryKey: allPipelineRunsKey,
    refetchInterval: pollWhileLive,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });

  const runs = useMemo<RunView[]>(() => {
    const merged: RunView[] = [
      ...(agents.data ?? []).map(agentRunToView),
      ...(pipelines.data ?? []).map(pipelineRunToView),
    ];
    return merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [agents.data, pipelines.data]);

  // The 2s runs poll is the freshest signal that a run has paused at a gate, so
  // when one *enters* `awaiting-approval` we refetch the pending-approval queue
  // immediately rather than waiting out its own 60s fallback poll. Edge-detect by
  // run id (not count) so a run re-entering the state at a later gate still fires.
  const qc = useQueryClient();
  const awaitingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const awaiting = new Set(runs.filter((r) => r.status === "awaiting-approval").map((r) => r.runId));
    const entered = [...awaiting].some((id) => !awaitingRef.current.has(id));
    awaitingRef.current = awaiting;
    if (entered) void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
  }, [runs, qc]);

  return { runs };
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
    for (const s of skills.data ?? []) if (s.glyph) map.set(s.id, s.glyph as IconName);
    for (const a of agents.data ?? []) if (a.glyph) map.set(a.id, a.glyph as IconName);
    return map;
  }, [skills.data, agents.data]);
}
