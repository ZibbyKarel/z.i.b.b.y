import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { TaskOutput } from "@zibby/contracts";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useCreateGoalMutation } from "../../goals";
import { type LoopFormState, buildCreateGoalBody, canSubmitLoop, makeGoalId } from "../loop";
import { useCreateTaskMutation } from "../mutations";
import { type TaskTarget, toApiTarget, whenLabel } from "../task";

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

/** The create-task outcome, exactly as the backend reports it. */
export type TaskSubmitResult =
  | { outcome: "dispatched"; runRef: string }
  | { outcome: "pending"; task: { id: string } }
  | { outcome: "scheduled"; task: { scheduledAt: number } };

export interface UseTaskSubmitArgs {
  title: string;
  /** The dispatched description (operator text plus any folded-in prior context). */
  composedText: string;
  paths: string[];
  attachmentSetId?: string;
  output: TaskOutput | undefined;
  /**
   * Phase 109: the operator's confirmed tool-grant set (from {@link ToolGrantsField},
   * via `CommandLine`'s pass-through prop). Undefined/empty omits the field from the
   * dispatched body entirely — the ceiling is still enforced server-side regardless.
   */
  toolGrants?: string[];
  /** An explicit single-dispatch target, or null for auto (the backend classifies). */
  chosenTarget: TaskTarget | null;
  isLoop: boolean;
  loop: LoopFormState;
  now: number;
  /** The raw operator text — guards an empty single dispatch. */
  text: string;
  onClose: () => void;
  setScheduledWhen: (when: string | null) => void;
  /** Fired with the raw result as soon as it lands — before the outcome branching
   *  (navigate / close / linger-then-close) runs. Lets a caller that embeds this hook
   *  (e.g. the CommandLine composite) observe the launch without re-implementing the
   *  dispatched/pending/scheduled handling itself. */
  onLaunched?: (result: TaskSubmitResult) => void;
}

export interface UseTaskSubmit {
  /** `scheduledAt` is resolved by the caller per action (e.g. a DropDownButton's
   *  "now" / "in 1h" / "when limits reset" options) — `null` runs immediately. */
  handleSubmit: (scheduledAt: number | null) => void;
  /** True while a create-task or create-goal mutation is in flight. */
  busy: boolean;
}

/**
 * Owns dispatch: a single task (auto or to an explicit target), or a loop (create the
 * goal, then enter it through a task carrying its goal target so the scheduler's
 * defer/limit/budget machinery owns the run). A dispatched run routes to `/archiv`
 * (F8d — `/runs` is gone); a scheduled one shows the lingering confirmation, then
 * closes.
 */
export function useTaskSubmit({
  title,
  composedText,
  paths,
  attachmentSetId,
  output,
  toolGrants,
  chosenTarget,
  isLoop,
  loop,
  now,
  text,
  onClose,
  setScheduledWhen,
  onLaunched,
}: UseTaskSubmitArgs): UseTaskSubmit {
  const router = useRouter();
  const { mutate: createTask, isPending: creatingTask } = useCreateTaskMutation();
  const { mutate: createGoal, isPending: creatingGoal } = useCreateGoalMutation();
  const busy = creatingTask || creatingGoal;

  const handleCreateTaskSuccess = useCallback(
    (res: Parameters<typeof selectApiResponseBody>[0]) => {
      const result = selectApiResponseBody(res) as TaskSubmitResult;
      onLaunched?.(result);
      // A dispatched run opens by its run ref; a `pending` task opens by its task id —
      // the feed row flips from the pending task to its run in place, and the Archive
      // screen keeps the selection because it matches `runId` OR `taskId`.
      if (result.outcome === "dispatched") {
        router.push(`/archiv?run=${encodeURIComponent(result.runRef)}`);
        onClose();
        return;
      }
      if (result.outcome === "pending") {
        router.push(`/archiv?run=${encodeURIComponent(result.task.id)}`);
        onClose();
        return;
      }
      setScheduledWhen(whenLabel(result.task.scheduledAt, now));
      setTimeout(onClose, CONFIRM_LINGER_MS);
    },
    [router, onClose, now, setScheduledWhen, onLaunched],
  );

  const submitSingle = useCallback(
    (scheduledAt: number | null) => {
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
            ...(toolGrants && toolGrants.length > 0 ? { toolGrants } : {}),
          },
        },
        { onSuccess: handleCreateTaskSuccess },
      );
    },
    [
      chosenTarget,
      createTask,
      title,
      composedText,
      paths,
      attachmentSetId,
      output,
      toolGrants,
      handleCreateTaskSuccess,
    ],
  );

  const submitLoop = useCallback(
    (scheduledAt: number | null) => {
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
                  ...(toolGrants && toolGrants.length > 0 ? { toolGrants } : {}),
                },
              },
              { onSuccess: handleCreateTaskSuccess },
            );
          },
        },
      );
    },
    [
      loop,
      title,
      now,
      composedText,
      paths,
      attachmentSetId,
      toolGrants,
      createGoal,
      createTask,
      handleCreateTaskSuccess,
    ],
  );

  const handleSubmit = useCallback(
    (scheduledAt: number | null) => {
      if (busy) return;
      if (isLoop) {
        if (!canSubmitLoop(loop)) return;
        submitLoop(scheduledAt);
        return;
      }
      if (text.trim().length <= 2) return;
      submitSingle(scheduledAt);
    },
    [busy, isLoop, loop, text, submitLoop, submitSingle],
  );

  return { handleSubmit, busy };
}
