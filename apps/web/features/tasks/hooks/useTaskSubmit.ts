import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { TaskOutput } from "@zibby/contracts";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useCreateGoalMutation } from "../../goals";
import {
  type LoopFormState,
  buildCreateGoalBody,
  canSubmitLoop,
  makeGoalId,
} from "../loop";
import { useCreateTaskMutation } from "../mutations";
import { type TaskTarget, toApiTarget, whenLabel } from "../task";

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

export interface UseTaskSubmitArgs {
  title: string;
  /** The dispatched description (operator text plus any folded-in prior context). */
  composedText: string;
  paths: string[];
  attachmentSetId?: string;
  scheduledAt: number | null;
  output: TaskOutput | undefined;
  /** An explicit single-dispatch target, or null for auto (the backend classifies). */
  chosenTarget: TaskTarget | null;
  isLoop: boolean;
  loop: LoopFormState;
  now: number;
  /** The raw operator text — guards an empty single dispatch. */
  text: string;
  onClose: () => void;
  setScheduledWhen: (when: string | null) => void;
}

export interface UseTaskSubmit {
  handleSubmit: () => void;
  /** True while a create-task or create-goal mutation is in flight. */
  busy: boolean;
}

/**
 * Owns dispatch: a single task (auto or to an explicit target), or a loop (create the
 * goal, then enter it through a task carrying its goal target so the scheduler's
 * defer/limit/budget machinery owns the run). A dispatched run routes to `/runs`; a
 * scheduled one shows the lingering confirmation, then closes.
 */
export function useTaskSubmit({
  title,
  composedText,
  paths,
  attachmentSetId,
  scheduledAt,
  output,
  chosenTarget,
  isLoop,
  loop,
  now,
  text,
  onClose,
  setScheduledWhen,
}: UseTaskSubmitArgs): UseTaskSubmit {
  const router = useRouter();
  const { mutate: createTask, isPending: creatingTask } = useCreateTaskMutation();
  const { mutate: createGoal, isPending: creatingGoal } = useCreateGoalMutation();
  const busy = creatingTask || creatingGoal;

  const handleCreateTaskSuccess = useCallback(
    (res: Parameters<typeof selectApiResponseBody>[0]) => {
      const result = selectApiResponseBody(res) as
        | { outcome: "dispatched"; runRef: string }
        | { outcome: "pending"; task: { id: string } }
        | { outcome: "scheduled"; task: { scheduledAt: number } };
      // A dispatched run opens by its run ref; a `pending` task opens by its task id —
      // the feed row flips from the pending task to its run in place, and the Runs
      // screen keeps the selection because it matches `runId` OR `taskId`.
      if (result.outcome === "dispatched") {
        router.push(`/runs?run=${encodeURIComponent(result.runRef)}`);
        onClose();
        return;
      }
      if (result.outcome === "pending") {
        router.push(`/runs?run=${encodeURIComponent(result.task.id)}`);
        onClose();
        return;
      }
      setScheduledWhen(whenLabel(result.task.scheduledAt, now));
      setTimeout(onClose, CONFIRM_LINGER_MS);
    },
    [router, onClose, now, setScheduledWhen],
  );

  const submitSingle = useCallback(() => {
    // An explicit pick (pre-selected or chosen) sends a target; auto omits it so the
    // backend classifies — byte-for-byte the un-seeded behaviour.
    createTask(
      {
        body: {
          title: title.trim() || undefined,
          text: composedText,
          paths,
          ...(attachmentSetId ? { attachmentSetId } : {}),
          scheduledAt,
          ...(chosenTarget ? { target: toApiTarget(chosenTarget) } : {}),
          ...(output ? { output } : {}),
        },
      },
      { onSuccess: handleCreateTaskSuccess },
    );
  }, [
    chosenTarget,
    createTask,
    title,
    composedText,
    paths,
    attachmentSetId,
    scheduledAt,
    output,
    handleCreateTaskSuccess,
  ]);

  const submitLoop = useCallback(() => {
    const seed = title.trim() || loop.objective;
    const goalId = makeGoalId(seed, now);
    const body = buildCreateGoalBody(loop, goalId, title);
    createGoal(
      { body },
      {
        onSuccess: () => {
          // Every loop enters through a task carrying its goal target — the scheduler's
          // defer/limit/budget machinery owns the dispatch (immediate when scheduledAt is
          // null, deferred otherwise). There is no direct goal-run start: only a task runs.
          createTask(
            {
              body: {
                title: title.trim() || undefined,
                text: composedText,
                paths,
                ...(attachmentSetId ? { attachmentSetId } : {}),
                scheduledAt,
                target: { kind: "goal", id: goalId, name: body.name ?? seed.slice(0, 80) },
              },
            },
            { onSuccess: handleCreateTaskSuccess },
          );
        },
      },
    );
  }, [
    loop,
    title,
    now,
    scheduledAt,
    composedText,
    paths,
    attachmentSetId,
    createGoal,
    createTask,
    handleCreateTaskSuccess,
  ]);

  const handleSubmit = useCallback(() => {
    if (busy) return;
    if (isLoop) {
      if (!canSubmitLoop(loop)) return;
      submitLoop();
      return;
    }
    if (text.trim().length <= 2) return;
    submitSingle();
  }, [busy, isLoop, loop, text, submitLoop, submitSingle]);

  return { handleSubmit, busy };
}
