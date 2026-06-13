import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the full goal-run history (the feed reads this). */
export function getGoalRunsQueryKey() {
  return ["goalRuns", "all"] as const;
}

/** Fallback poll interval used only when the SSE status channel is down. */
const GOAL_RUNS_POLL_MS = 2000;

/**
 * The full goal-run history (`GET /api/goals/run-history`). Push-driven via the
 * `/api/events` `goal-runs` scope; the poll is the fallback for when the stream is
 * down. Returns the `useQuery` result directly (body stripped via `select`).
 */
export function useGoalRunsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.goalRuns.listAllGoalRuns.useQuery({
    queryKey: getGoalRunsQueryKey(),
    refetchInterval: streamConnected ? false : GOAL_RUNS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
