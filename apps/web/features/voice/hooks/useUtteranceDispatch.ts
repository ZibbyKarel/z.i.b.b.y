"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useStopAgentMutation } from "../../runs/mutations";
import { useCreateTaskMutation } from "../../tasks/mutations";
import { extractPaths } from "../../tasks/task";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../../runs/run";
import { parseUtterance } from "../parseUtterance";
import { type VoiceAck, runVoiceAction } from "../runVoiceAction";

export interface UseUtteranceDispatchOptions {
  /** Pending gates — `[0]` is the "latest" an approve/reject command acts on. */
  approvals: Pick<DashboardApproval, "id">[];
  /** Currently running runs — the first **agent** run is what "stop" targets. */
  liveRuns: Pick<RunView, "runId" | "kind" | "status">[];
  /** Leaves voice mode (navigate / close). */
  onExit: () => void;
  /** Speaks the on-demand status briefing (a spoken "co se děje" / "status"). */
  onBrief: () => void;
}

export interface UtteranceDispatch {
  /** Parse a finalized utterance and run it; returns the ack it produced. */
  dispatch: (text: string) => VoiceAck;
  /** The most recent acknowledgement, for an `aria-live` + TTS surface. */
  ack: VoiceAck | null;
}

/**
 * Binds the pure {@link parseUtterance}/{@link runVoiceAction} pair to the real
 * approval/stop mutations, the Next router and the overlay exit. The voice screen
 * calls `dispatch` once per finalized transcript.
 *
 * A spoken **task** dispatches straight to the `/tasks` layer ({@link useCreateTaskMutation}
 * — the Phase-11 backend classifier routes agent/pipeline/orchestrator), then the ack
 * flips `dispatching → started` (or `dispatchFailed`); there is **no composer modal** and
 * **no navigation**, so the overlay stays open and the new run surfaces in the live HUD
 * panels (North Star: confirming understanding is the conversation's job, never a modal).
 * Gate **answers** (approve/reject) are the operator's own spoken decision *at* the gate —
 * nothing here bypasses it.
 */
export function useUtteranceDispatch(
  options: UseUtteranceDispatchOptions,
): UtteranceDispatch {
  const { approvals, liveRuns, onExit, onBrief } = options;
  const router = useRouter();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const stop = useStopAgentMutation();
  const createTask = useCreateTaskMutation();
  const [ack, setAck] = useState<VoiceAck | null>(null);

  const pendingApprovalId = approvals[0]?.id;
  const activeRunId = liveRuns.find(
    (r) => r.status === "running" && r.kind === "agent",
  )?.runId;

  const dispatchTask = useCallback(
    (text: string) => {
      createTask.mutate(
        { body: { text, paths: extractPaths(text) } },
        {
          onSuccess: () => setAck({ key: "started" }),
          onError: () => setAck({ key: "dispatchFailed" }),
        },
      );
    },
    [createTask],
  );

  const dispatch = useCallback(
    (text: string): VoiceAck => {
      const result = runVoiceAction(parseUtterance(text), {
        pendingApprovalId,
        activeRunId,
        approve: (id) => approve.mutate({ params: { id }, body: {} }),
        reject: (id) => reject.mutate({ params: { id }, body: {} }),
        stop: (runId) => stop.mutate({ params: { runId }, body: {} }),
        navigate: (route) => router.push(route),
        dispatchTask,
        brief: onBrief,
        close: onExit,
      });
      setAck(result);
      return result;
    },
    [
      pendingApprovalId,
      activeRunId,
      approve,
      reject,
      stop,
      router,
      onExit,
      onBrief,
      dispatchTask,
    ],
  );

  return { dispatch, ack };
}
