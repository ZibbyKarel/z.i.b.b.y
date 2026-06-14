"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useStopAgentMutation } from "../../runs/mutations";
import {
  useClassifyTaskMutation,
  useCreateTaskMutation,
} from "../../tasks/mutations";
import { extractPaths, isLowConfidence } from "../../tasks/task";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
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

/** How many candidate names ZIBBY reads back when asking the operator to clarify. */
const CLARIFY_CANDIDATES = 3;

/**
 * Binds the pure {@link parseUtterance}/{@link runVoiceAction} pair to the real
 * approval/stop mutations, the Next router and the overlay exit. The voice screen
 * calls `dispatch` once per finalized transcript.
 *
 * A spoken **task** is classify-first (the read-only Phase-11 verdict): high/medium
 * confidence dispatches straight to the `/tasks` layer ({@link useCreateTaskMutation});
 * **low** confidence asks a spoken follow-up ({@link isLowConfidence}) instead of
 * dispatching blind, and the operator's next utterance is combined and dispatched —
 * a bounded two-turn dialogue (never a second ask), no composer modal, no navigation.
 * Gate **answers** (approve/reject) are the operator's own spoken decision *at* the
 * gate — those never classify and never bypass it.
 */
export function useUtteranceDispatch(
  options: UseUtteranceDispatchOptions,
): UtteranceDispatch {
  const { approvals, liveRuns, onExit, onBrief } = options;
  const router = useRouter();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const stop = useStopAgentMutation();
  const classify = useClassifyTaskMutation();
  const createTask = useCreateTaskMutation();
  const [ack, setAck] = useState<VoiceAck | null>(null);
  // The original utterance awaiting a clarification answer (null = none pending).
  const pendingClarify = useRef<string | null>(null);

  const pendingApprovalId = approvals[0]?.id;
  const activeRunId = liveRuns.find(
    (r) => r.status === "running" && r.kind === "agent",
  )?.runId;

  // Actually send the task to the `/tasks` layer (the backend classifier routes it).
  const doDispatch = useCallback(
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

  // The createTask branch's handler: classify first, then dispatch — or ask once.
  const dispatchTask = useCallback(
    (text: string) => {
      classify.mutate(
        { body: { text, paths: extractPaths(text) } },
        {
          onSuccess: (res) => {
            const routing = selectApiResponseBody(res);
            if (!isLowConfidence(routing.confidence)) {
              doDispatch(text);
              return;
            }
            // Too unsure to route blind — ask, remembering the original utterance.
            pendingClarify.current = text;
            const options = routing.candidates
              .slice(0, CLARIFY_CANDIDATES)
              .map((c) => c.name)
              .join(", ");
            setAck(
              options
                ? { key: "clarify", values: { options } }
                : { key: "clarifyGeneric" },
            );
          },
          onError: () => setAck({ key: "dispatchFailed" }),
        },
      );
    },
    [classify, doDispatch],
  );

  const dispatch = useCallback(
    (text: string): VoiceAck => {
      // Second turn: this utterance answers a pending clarification. Combine it with
      // the original and dispatch regardless of confidence — bounded to one round, so
      // it always terminates (no second ask).
      if (pendingClarify.current !== null) {
        const combined = `${pendingClarify.current} ${text}`.trim();
        pendingClarify.current = null;
        const result: VoiceAck = {
          key: "dispatching",
          values: { task: combined },
        };
        setAck(result);
        doDispatch(combined);
        return result;
      }

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
      doDispatch,
    ],
  );

  return { dispatch, ack };
}
