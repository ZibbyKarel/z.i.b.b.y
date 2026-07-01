"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { getRunningAgentsQueryKey } from "../agents/queries/keys";
import type { ActivityEntry } from "@zibby/contracts";
import { getApprovalsQueryKey } from "../approvals/queries/keys";
import { getBudgetQueryKey } from "../projects/queries/keys";
import { getActivityQueryKey } from "../overview/queries/useActivityQuery";
import { prependActivityEntry } from "../overview/queries/useActivityFeedInfiniteQuery";
import { getBriefingQueryKey } from "../overview/queries/useBriefingQuery";
import { getChannelItemsQueryKey } from "../integrations/queries/useChannelItemsQuery";
import { getPipelineRunQueryKey } from "../pipelines/queries/keys";
import { getScheduledTasksQueryKey } from "../tasks/queries/useScheduledTasksQuery";
import { API_URL } from "../../state/api";
import { allTaskRunsKey } from "./queries/keys";

/**
 * Payload mirror of the API's events (see apps/api/src/shared/sse/sse.ts and the
 * channels SSE merge). Run events carry `{ scope, runId, status }`; channel-item
 * events carry `{ scope: "channel-items", itemId, state }`. Unknown scopes are
 * ignored, so the channel scope was safe to add to the server merge.
 */
interface RunStatusEvent {
  scope: "agent-runs" | "pipeline-runs" | "goal-runs" | "channel-items" | "activity";
  runId?: string;
  status?: string;
  /** Activity-scope only: the recorded kind (drives the briefing refetch). */
  kind?: string;
  /** Activity-scope only: the full entry, prepended onto the live-log feed. */
  entry?: ActivityEntry;
}

/**
 * Whether the unified `/api/events` SSE channel is currently connected. The run
 * queries read this: while it's `true` they drop their polling intervals and rely
 * on stream-driven invalidation; when it's `false` (no provider, SSE blocked by a
 * proxy, or mid-reconnect) they fall back to their original self-gating polls, so
 * the dashboard degrades gracefully instead of going stale.
 */
const RunEventsContext = createContext<boolean>(false);

export function useRunEventsConnected(): boolean {
  return useContext(RunEventsContext);
}

/**
 * Opens one `EventSource` to the API's multiplexed status channel and turns each
 * run transition into a targeted query invalidation — replacing the per-view
 * polling of the running list, the all-runs history (both 2s) and the pipeline
 * aggregate (1s). The channel is just a signal ("this family changed, refetch"),
 * keeping the list endpoints the single source of truth. EventSource handles
 * reconnection (resuming via `Last-Event-ID`); we only track connectivity so the
 * queries know whether to self-poll as a fallback. Mounted once, high in the tree.
 */
export function RunEventsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!API_URL || typeof EventSource === "undefined") return;
    const source = new EventSource(`${API_URL}/api/events`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      let parsed: RunStatusEvent;
      try {
        parsed = JSON.parse(event.data) as RunStatusEvent;
      } catch {
        return;
      }
      if (parsed.scope === "agent-runs") {
        void qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
        void qc.invalidateQueries({ queryKey: allTaskRunsKey });
        // A run starting/ending changes a project's running count + may drain the
        // queue (held → dispatched), so the budget readout must refresh too.
        void qc.invalidateQueries({ queryKey: getBudgetQueryKey() });
        if (parsed.status === "awaiting-approval") {
          void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
        }
      } else if (parsed.scope === "pipeline-runs" && parsed.runId) {
        void qc.invalidateQueries({ queryKey: allTaskRunsKey });
        // The single-run aggregate (a goal's pipeline maker timeline) is keyed by id.
        void qc.invalidateQueries({ queryKey: getPipelineRunQueryKey(parsed.runId) });
        void qc.invalidateQueries({ queryKey: getBudgetQueryKey() });
        if (parsed.status === "parked") {
          void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
        }
      } else if (parsed.scope === "goal-runs") {
        // Phase 10: a goal transition refreshes the feed; a parked goal is a Tier-3
        // decision, so refresh the approvals/briefing surfaces it rides too.
        void qc.invalidateQueries({ queryKey: allTaskRunsKey });
        void qc.invalidateQueries({ queryKey: getBudgetQueryKey() });
        if (parsed.status === "parked") {
          void qc.invalidateQueries({ queryKey: getBriefingQueryKey() });
        }
      } else if (parsed.scope === "channel-items") {
        // Triage filed/transitioned an inbound item — refresh the inbox and the
        // approvals queue (a Tier-3 reply lands as a pending channel approval).
        void qc.invalidateQueries({ queryKey: getChannelItemsQueryKey() });
        void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
      } else if (parsed.scope === "activity") {
        // A new activity entry was recorded. The rail's live-log feed gets the full
        // entry prepended (no refetch); the small overview feed AND the briefing
        // card invalidate — the GET briefing is a live assembly of pending approvals,
        // parked runs and channel items, all of which emit activity entries, so any
        // recorded action can change what the card should show.
        if (parsed.entry) prependActivityEntry(qc, parsed.entry);
        void qc.invalidateQueries({ queryKey: getActivityQueryKey() });
        void qc.invalidateQueries({ queryKey: getBriefingQueryKey() });
        // An approval born outside a run transition (e.g. a task held on budget)
        // announces itself only as `approval-requested` activity — refresh the
        // pending queue off it so the gate surfaces without waiting for a poll.
        if (parsed.kind?.startsWith("approval-")) {
          void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
        }
      }
      // A new run may be a scheduled task firing (scheduled → dispatched); refresh
      // the deferred queue so the waiting card swaps for its run instead of doubling.
      if (parsed.status === "running") {
        void qc.invalidateQueries({ queryKey: getScheduledTasksQueryKey() });
      }
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [qc]);

  return <RunEventsContext.Provider value={connected}>{children}</RunEventsContext.Provider>;
}
