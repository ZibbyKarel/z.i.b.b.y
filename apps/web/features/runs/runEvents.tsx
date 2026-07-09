"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { getRunningAgentsQueryKey } from "../agents/queries/keys";
import type { ActivityEntry } from "@zibby/contracts";
import { getApprovalsQueryKey } from "../approvals/queries/keys";
import { getChainRunsQueryKey } from "../chains/queries/keys";
import { getBudgetQueryKey, getCiStatusQueryKey } from "../projects/queries/keys";
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
 * ignored, so the channel scope was safe to add to the server merge. Exported (Phase
 * 89) so the subsystem web's particle mapping can type the events it reads off
 * {@link onRunEvent} without re-declaring the shape.
 */
export interface RunStatusEvent {
  scope: "agent-runs" | "pipeline-runs" | "goal-runs" | "chain-runs" | "channel-items" | "activity";
  runId?: string;
  status?: string;
  /** Activity-scope only: the recorded kind (drives the briefing refetch). */
  kind?: string;
  /** Activity-scope only: the full entry, prepended onto the live-log feed. */
  entry?: ActivityEntry;
}

type RunEventListener = (event: RunStatusEvent) => void;

/**
 * Phase 89: every parsed event the provider's ONE `EventSource` receives, fanned out
 * to plain listeners — no second connection, no state library, no re-shaping. A
 * module-level set rather than context state because the provider is mounted once,
 * high in the tree ("Mounted once, high in the tree" — see the provider's own doc
 * comment below); a listener added before the provider itself mounts (or surviving
 * across a remount in tests) still works, since it's independent of any component
 * instance. The subsystem web's particle layer (`SubsystemWeb`) is the first
 * consumer: it turns a real dispatch/report transition into a center↔node flight,
 * never a timer.
 */
const listeners = new Set<RunEventListener>();

/** Subscribe to every `RunStatusEvent` the provider parses. Returns an unsubscribe. */
export function onRunEvent(listener: RunEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
      // Fan out to plain subscribers first (Phase 89) — every scope, unfiltered;
      // consumers decide what's actionable, the same posture the invalidation
      // branches below already take toward unknown scopes. Isolated per-listener:
      // a subscriber's bug must never break the invalidation this provider exists
      // for, so one throwing listener is swallowed (loudly, via console.error) and
      // the rest still run.
      listeners.forEach((listener) => {
        try {
          listener(parsed);
        } catch (error) {
          console.error("RunEventsProvider: onRunEvent listener threw", error);
        }
      });
      if (parsed.scope === "agent-runs") {
        void qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
        void qc.invalidateQueries({ queryKey: allTaskRunsKey });
        // A run starting/ending changes a project's running count + may drain the
        // queue (held → dispatched), so the budget readout must refresh too.
        void qc.invalidateQueries({ queryKey: getBudgetQueryKey() });
        if (parsed.status === "awaiting-approval") {
          void qc.invalidateQueries({ queryKey: getApprovalsQueryKey() });
        }
        // Fáze 14.4: the chat's inline run card (Fáze 14.3) reads the single-run
        // aggregate (`usePipelineRunQuery`) for agent runs too, not only pipeline/
        // chain runs — without invalidating it here the card would only ever
        // update off that query's 1s fallback poll instead of this push.
        if (parsed.runId) {
          void qc.invalidateQueries({ queryKey: getPipelineRunQueryKey(parsed.runId) });
        }
      } else if (parsed.scope === "pipeline-runs" && parsed.runId) {
        void qc.invalidateQueries({ queryKey: allTaskRunsKey });
        // The single-run aggregate (a goal's pipeline maker timeline) is keyed by id.
        void qc.invalidateQueries({ queryKey: getPipelineRunQueryKey(parsed.runId) });
        void qc.invalidateQueries({ queryKey: getBudgetQueryKey() });
        // A chain advances exactly when a pipeline run transitions (N4a).
        void qc.invalidateQueries({ queryKey: getChainRunsQueryKey() });
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
      } else if (parsed.scope === "chain-runs") {
        // Phase 104A: the chain run's own transition (start/advance/park/finish),
        // now flowing on its own scope alongside the indirect `pipeline-runs`
        // signal a step's transition already produces above — invalidate
        // directly so a chain-level state change (e.g. parked) never waits on
        // that indirection.
        void qc.invalidateQueries({ queryKey: getChainRunsQueryKey() });
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
        // N4b: a monitor alert means the watcher just refreshed the CI status
        // sidecar too — refresh the project-detail chip without waiting for its
        // slow interval (which exists for the silent green recovery).
        if (parsed.kind === "monitor-alert") {
          void qc.invalidateQueries({ queryKey: getCiStatusQueryKey() });
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
