import { useCancelScheduledTaskMutation } from "../tasks";
import {
  useDeleteAgentRunMutation,
  useDeleteWorkflowRunMutation,
  usePauseTaskRunMutation,
  useResumeTaskRunMutation,
  useStopTaskRunMutation,
} from "./mutations";
import { type RunView, isResumableRun, isStoppableRun } from "./run";

export interface ResumeRunOptions {
  /** continue (default): `--resume` session / continue in place. fresh: a new task from the original inputs. */
  mode?: "continue" | "fresh";
  note?: string;
}

export interface RunActions {
  stop: (run: RunView) => void;
  stopping: boolean;
  /** Pause a running workflow at its next stage boundary; other kinds/states no-op. */
  pause: (run: RunView) => void;
  pausing: boolean;
  /**
   * Absent kinds/states no-op — `isResumableRun`, widened to any parked/paused run, a
   * pausing run (cancels the pause) and a `fresh` re-run of a done run (the API is the
   * authority on those).
   */
  resume: (run: RunView, opts?: ResumeRunOptions) => void;
  resuming: boolean;
  remove: (runId: string, kind: string) => void;
  deleting: boolean;
}

/**
 * The Stop/Resume/Delete mutation wiring `RunDetail` needs — factored out of
 * `runs/Screen.tsx` (Phase 100) so the chat screen's inline detail column gets the
 * exact same behavior (same guards, same "delete a scheduled task cancels it
 * instead" branch) without re-deriving it.
 *
 * What counts as "the selection" differs per caller (a `?run=` URL param on the
 * runs screen, local state in chat) — so callers hand in `onResumed`/`onRemoved` to
 * decide that themselves: `onResumed` fires with the freshly-spawned run's id (Phase
 * 49 — re-running jumps the selection to it), `onRemoved` fires before the delete
 * mutation goes out (clears the selection first so the detail pane never briefly
 * points at a now-gone run).
 */
export function useRunActions(
  onResumed: (runId: string) => void,
  onRemoved: () => void,
): RunActions {
  const stopRun = useStopTaskRunMutation();
  const resumeRun = useResumeTaskRunMutation();
  const pauseRun = usePauseTaskRunMutation();
  const deleteAgent = useDeleteAgentRunMutation();
  const deleteWorkflow = useDeleteWorkflowRunMutation();
  const cancelTask = useCancelScheduledTaskMutation();

  const stop = (run: RunView) => {
    if (isStoppableRun(run)) stopRun.mutate({ params: { runId: run.runId }, body: {} });
  };

  const pause = (run: RunView) => {
    if (run.kind === "workflow" && run.status === "running")
      pauseRun.mutate({ params: { runId: run.runId }, body: {} });
  };

  const resume = (run: RunView, opts: ResumeRunOptions = {}) => {
    const allowed =
      isResumableRun(run) ||
      run.status === "parked" ||
      run.status === "paused" ||
      // RESUME while pausing cancels the pending pause.
      (run.status === "running" && run.pauseRequested === true) ||
      (opts.mode === "fresh" && run.status === "done");
    if (!allowed) return;
    const body = {
      ...(opts.mode && { mode: opts.mode }),
      ...(opts.note?.trim() && { note: opts.note.trim() }),
    };
    resumeRun.mutate(
      { params: { runId: run.runId }, body },
      {
        onSuccess: (res) => {
          if (res.body.runId !== run.runId) onResumed(res.body.runId);
        },
      },
    );
  };

  const remove = (runId: string, kind: string) => {
    onRemoved();
    if (kind === "agent") deleteAgent.mutate({ params: { runId } });
    else if (kind === "workflow") deleteWorkflow.mutate({ params: { runId } });
    else if (kind === "scheduled") cancelTask.mutate({ params: { id: runId } });
  };

  return {
    stop,
    stopping: stopRun.isPending,
    pause,
    pausing: pauseRun.isPending,
    resume,
    resuming: resumeRun.isPending,
    remove,
    deleting: deleteAgent.isPending || deleteWorkflow.isPending || cancelTask.isPending,
  };
}
