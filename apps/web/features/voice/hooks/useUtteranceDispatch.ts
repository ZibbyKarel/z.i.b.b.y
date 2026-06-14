"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useStopAgentMutation } from "../../runs/mutations";
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
  /** Hands a non-command utterance to the composer seam (the "heard" path). */
  onStageTask: (text: string) => void;
}

export interface UtteranceDispatch {
  /** Parse a finalized utterance and run it; returns the ack it produced. */
  dispatch: (text: string) => VoiceAck;
  /** The most recent acknowledgement, for an `aria-live` surface. */
  ack: VoiceAck | null;
}

/**
 * Binds the pure {@link parseUtterance}/{@link runVoiceAction} pair to the real
 * approval/stop mutations, the Next router and the overlay exit. The voice screen
 * calls `dispatch` once per finalized transcript; commands act immediately, plain
 * speech is staged as a one-tap task. Nothing here bypasses the gate — approve/reject
 * are the operator's own spoken decision at the gate.
 */
export function useUtteranceDispatch(
  options: UseUtteranceDispatchOptions,
): UtteranceDispatch {
  const { approvals, liveRuns, onExit, onStageTask } = options;
  const router = useRouter();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const stop = useStopAgentMutation();
  const [ack, setAck] = useState<VoiceAck | null>(null);

  const pendingApprovalId = approvals[0]?.id;
  const activeRunId = liveRuns.find(
    (r) => r.status === "running" && r.kind === "agent",
  )?.runId;

  const dispatch = useCallback(
    (text: string): VoiceAck => {
      const result = runVoiceAction(parseUtterance(text), {
        pendingApprovalId,
        activeRunId,
        approve: (id) => approve.mutate({ params: { id }, body: {} }),
        reject: (id) => reject.mutate({ params: { id }, body: {} }),
        stop: (runId) => stop.mutate({ params: { runId }, body: {} }),
        navigate: (route) => router.push(route),
        stageTask: onStageTask,
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
      onStageTask,
    ],
  );

  return { dispatch, ack };
}
