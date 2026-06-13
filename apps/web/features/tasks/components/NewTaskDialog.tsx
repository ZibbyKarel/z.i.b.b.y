"use client";
import {
  Accordion,
  AccordionItem,
  Button,
  Container,
  Dialog,
  IconTile,
  SelectField,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import {
  useCreateGoalMutation,
  useStartGoalMutation,
} from "../../goals/mutations";
import { useLimitsQuery } from "../../limits/queries/useLimitsQuery";
import {
  INITIAL_LOOP_STATE,
  type LoopFormState,
  buildCreateGoalBody,
  canSubmitLoop,
  makeGoalId,
  proposedGoalToLoopState,
} from "../loop";
import { useClassifyTaskMutation, useCreateTaskMutation } from "../mutations";
import {
  type SchedulePreset,
  type TaskRouting,
  type TaskTarget,
  extractPaths,
  resolveScheduledAt,
  toClientRouting,
  whenLabel,
} from "../task";
import { LoopComposer } from "./LoopComposer";
import { PlanPreview } from "./PlanPreview";
import { ScheduleField } from "./ScheduleField";
import { TaskComposer } from "./TaskComposer";

export interface NewTaskDialogProps {
  onClose: () => void;
  /** Phase 11.4: seed the description field (a voice transcript / external trigger). */
  initialText?: string;
}

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

/** Debounce before the live classify preview fires while the operator types. */
const CLASSIFY_DEBOUNCE_MS = 350;

/** Project a client target onto the wire shape `createTask` accepts (drops nothing). */
function toApiTarget(target: TaskTarget) {
  if (target.kind === "orchestrator") {
    return { kind: "orchestrator" as const, name: target.name, glyph: target.glyph, category: target.category };
  }
  return {
    kind: target.kind,
    id: target.id,
    name: target.name,
    glyph: target.glyph,
    category: target.category,
  };
}

/**
 * The whole New Task flow in one modal (Phase 11): a single described intent. The
 * operator says what they want; a debounced classify shows a compact "ZIBBY will…"
 * {@link PlanPreview} — the *how* (single dispatch vs a synthesized loop) is inferred,
 * not chosen on a form. Advanced control survives behind an "Edit" disclosure
 * (the goal {@link LoopComposer} for a loop, a manual target picker for a
 * low-confidence single). Submitting dispatches a task or — for a loop — creates the
 * goal and starts its run (scheduled loops defer through the task scheduler). Risky
 * actions are still caught later by the approval gate.
 */
export function NewTaskDialog({ onClose, initialText }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const { mutate: createTask, isPending: creatingTask } = useCreateTaskMutation();
  const { mutate: classify } = useClassifyTaskMutation();
  const { mutate: createGoal, isPending: creatingGoal } = useCreateGoalMutation();
  const { mutate: startGoal, isPending: startingGoal } = useStartGoalMutation();
  const { data: limits } = useLimitsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState(initialText ?? "");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<SchedulePreset>("now");
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);

  const [routing, setRouting] = useState<TaskRouting | null>(null);
  const [loop, setLoop] = useState<LoopFormState>(INITIAL_LOOP_STATE);
  const [loopEdited, setLoopEdited] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);
  /** Manual single-mode override: an index into `routing.candidates`, or null. */
  const [overrideIndex, setOverrideIndex] = useState<string>("");

  // A stable "now" for the dialog's lifetime: presets resolve against it, the
  // limit-reset option gates on it, and the goal id's uniqueness suffix uses it.
  const [now] = useState(() => Date.now());
  const resetsAt = limits?.rolling.resetsAt ?? null;

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const busy = creatingTask || creatingGoal || startingGoal;
  const scheduledAt = resolveScheduledAt(preset, now, resetsAt);
  // Gate the preview on a long-enough query so a stale verdict never lingers after
  // the field is cleared (no setState-in-effect needed to reset it).
  const hasQuery = text.trim().length > 2;
  const activeRouting = hasQuery ? routing : null;
  const isLoop = activeRouting?.mode === "loop";

  // ── Live classify preview ───────────────────────────────────────────────
  // Debounced, side-effect-free verdict (the backend never starts a run here).
  useEffect(() => {
    if (text.trim().length <= 2) return;
    const handle = setTimeout(() => {
      classify(
        { body: { text, paths } },
        {
          onSuccess: (res) => setRouting(toClientRouting(selectApiResponseBody(res))),
        },
      );
    }, CLASSIFY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, paths, classify]);

  // Seed the Loop form from a fresh proposal during render (the React-sanctioned
  // "adjust state on prop change" pattern, guarded against re-running) — unless the
  // operator has already edited it.
  const proposedGoalKey = activeRouting?.proposedGoal
    ? JSON.stringify(activeRouting.proposedGoal)
    : null;
  if (proposedGoalKey && proposedGoalKey !== seededKey) {
    setSeededKey(proposedGoalKey);
    if (!loopEdited && activeRouting?.proposedGoal) {
      setLoop(proposedGoalToLoopState(activeRouting.proposedGoal));
    }
  }

  const patchLoop = useCallback((patch: Partial<LoopFormState>) => {
    setLoopEdited(true);
    setLoop((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCreateTaskSuccess = useCallback(
    (res: Parameters<typeof selectApiResponseBody>[0]) => {
      const result = selectApiResponseBody(res) as
        | { outcome: "dispatched"; runRef: string }
        | { outcome: "scheduled"; task: { scheduledAt: number } };
      if (result.outcome === "dispatched") {
        router.push(`/runs?run=${encodeURIComponent(result.runRef)}`);
        onClose();
        return;
      }
      setScheduledWhen(whenLabel(result.task.scheduledAt, now));
      setTimeout(onClose, CONFIRM_LINGER_MS);
    },
    [router, onClose, now],
  );

  const submitSingle = useCallback(() => {
    const override =
      overrideIndex !== "" && activeRouting
        ? activeRouting.candidates[Number(overrideIndex)]
        : undefined;
    createTask(
      {
        body: {
          title: title.trim() || undefined,
          text,
          paths,
          scheduledAt,
          ...(override ? { target: toApiTarget(override) } : {}),
        },
      },
      { onSuccess: handleCreateTaskSuccess },
    );
  }, [overrideIndex, activeRouting, createTask, title, text, paths, scheduledAt, handleCreateTaskSuccess]);

  const submitLoop = useCallback(() => {
    const seed = title.trim() || loop.objective;
    const goalId = makeGoalId(seed, now);
    const body = buildCreateGoalBody(loop, goalId, title);
    createGoal(
      { body },
      {
        onSuccess: () => {
          if (scheduledAt !== null) {
            // Scheduled loop: the goal exists; the task carries its target so the
            // scheduler's defer/limit/budget machinery owns the dispatch (Decision 4).
            createTask(
              {
                body: {
                  title: title.trim() || undefined,
                  text,
                  paths,
                  scheduledAt,
                  target: { kind: "goal", id: goalId, name: body.name ?? seed.slice(0, 80) },
                },
              },
              { onSuccess: handleCreateTaskSuccess },
            );
            return;
          }
          // Immediate loop: start the goal run directly (the maker ⇄ verifier loop).
          startGoal(
            {
              params: { id: goalId },
              body: {
                title: title.trim() || undefined,
                files: paths.length > 0 ? paths : undefined,
              },
            },
            {
              onSuccess: (res) => {
                const run = selectApiResponseBody(res) as { goalRunId: string };
                router.push(`/runs?run=${encodeURIComponent(run.goalRunId)}`);
                onClose();
              },
            },
          );
        },
      },
    );
  }, [loop, title, now, scheduledAt, text, paths, createGoal, createTask, startGoal, router, onClose, handleCreateTaskSuccess]);

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

  const handleRemovePath = useCallback((path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
  }, []);

  const canSubmit = isLoop ? canSubmitLoop(loop) : text.trim().length > 2;

  const header = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph="plus" size="md" />
      <Container grow minW0>
        <Typography mono size="md" tracking="wide" type="note" weight="bold">
          {t("dialogTitle")}
        </Typography>
        <Typography size="sm" type="note" variant="secondary">
          {t("dialogSubtitle")}
        </Typography>
      </Container>
    </Stack>
  );

  if (scheduledWhen !== null) {
    return (
      <Dialog
        open
        ariaLabel={t("dialogTitle")}
        closeLabel={t("cancel")}
        onClose={onClose}
        title={header}
        width="lg"
      >
        <Stack align="center" gap="100">
          <IconTile glyph="bolt" size="lg" tone="accent" />
          <Typography size="md" type="text" weight="medium">
            {t("confirm.accepted")}
          </Typography>
          <Typography mono size="sm" type="note" variant="secondary">
            {t("confirm.scheduled", { when: scheduledWhen })}
          </Typography>
        </Stack>
      </Dialog>
    );
  }

  // Submit label/icon: a schedule wins; else a loop reads as "run loop"; else "run".
  let submitLabel: string;
  let submitIcon: "play" | "clock" | "retry";
  if (scheduledAt !== null) {
    submitLabel = t("schedule.submit");
    submitIcon = "clock";
  } else if (isLoop) {
    submitLabel = t("loop.submit");
    submitIcon = "retry";
  } else {
    submitLabel = t("classifyRun");
    submitIcon = "play";
  }

  const actions = (
    <Stack grow align="center" direction="row" gap="100" justify="end">
      <Button icon="x" intent="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
      <Button
        disabled={!canSubmit}
        icon={submitIcon}
        intent="primary"
        loading={busy}
        onClick={handleSubmit}
      >
        {submitLabel}
      </Button>
    </Stack>
  );

  const candidateOptions = activeRouting
    ? [
        { value: "", label: t("override.auto") },
        ...activeRouting.candidates.map((c, i) => ({ value: String(i), label: c.name })),
      ]
    : [];

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={t("dialogTitle")}
      closeLabel={t("cancel")}
      onClose={onClose}
      title={header}
      width="lg"
    >
      <Stack gap="150">
        <TextInputField
          label={t("title.label")}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("title.placeholder")}
          value={title}
        />

        <TaskComposer
          onChange={setText}
          onRemovePath={handleRemovePath}
          onSubmit={handleSubmit}
          paths={paths}
          value={text}
        />

        {activeRouting && <PlanPreview routing={activeRouting} />}

        {activeRouting && (
          <Accordion>
            <AccordionItem summary={t("edit.label")}>
              {isLoop ? (
                <LoopComposer onChange={patchLoop} state={loop} />
              ) : (
                <SelectField
                  hint={t("override.hint")}
                  label={t("override.label")}
                  onValueChange={setOverrideIndex}
                  options={candidateOptions}
                  value={overrideIndex}
                />
              )}
            </AccordionItem>
          </Accordion>
        )}

        <ScheduleField
          now={now}
          onChange={setPreset}
          resetsAt={resetsAt}
          value={preset}
        />
      </Stack>
    </Dialog>
  );
}
