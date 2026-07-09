import { useCancelScheduledTaskMutation } from "../tasks";
import {
  useDeleteAgentRunMutation,
  useDeletePipelineRunMutation,
  useResumeTaskRunMutation,
  useStopTaskRunMutation,
} from "./mutations";
import { type RunView, isResumableRun, isStoppableRun } from "./run";

export interface RunActions {
  stop: (run: RunView) => void;
  stopping: boolean;
  /** Absent kinds/states no-op — same guard `isResumableRun` applies before firing. */
  resume: (run: RunView) => void;
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
  const deleteAgent = useDeleteAgentRunMutation();
  const deletePipeline = useDeletePipelineRunMutation();
  const cancelTask = useCancelScheduledTaskMutation();

  const stop = (run: RunView) => {
    if (isStoppableRun(run)) stopRun.mutate({ params: { runId: run.runId }, body: {} });
  };

  const resume = (run: RunView) => {
    if (!isResumableRun(run)) return;
    resumeRun.mutate(
      { params: { runId: run.runId }, body: {} },
      { onSuccess: (res) => onResumed(res.body.runId) },
    );
  };

  const remove = (runId: string, kind: string) => {
    onRemoved();
    if (kind === "agent") deleteAgent.mutate({ params: { runId } });
    else if (kind === "pipeline") deletePipeline.mutate({ params: { runId } });
    else if (kind === "scheduled") cancelTask.mutate({ params: { id: runId } });
  };

  return {
    stop,
    stopping: stopRun.isPending,
    resume,
    resuming: resumeRun.isPending,
    remove,
    deleting: deleteAgent.isPending || deletePipeline.isPending || cancelTask.isPending,
  };
}
