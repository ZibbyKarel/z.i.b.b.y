"use client";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
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
} from "../loop";
import { useCreateTaskMutation } from "../mutations";
import {
  type SchedulePreset,
  extractPaths,
  resolveScheduledAt,
  whenLabel,
} from "../task";
import { LoopComposer } from "./LoopComposer";
import { ScheduleField } from "./ScheduleField";
import { TaskComposer } from "./TaskComposer";

export interface NewTaskDialogProps {
  onClose: () => void;
}

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

type TaskMode = "standard" | "loop";

/**
 * The whole New Task flow in one modal, split into two modes:
 *
 * - **Standard** — name (optional) → describe → choose when → one click. An immediate
 *   task classifies in the background, hands to the routed agent or pipeline, and
 *   redirects to the new run. A delayed task is parked server-side.
 * - **Loop** — hand ZIBBY a goal, a maker (agent/pipeline), and a verifier. Submitting
 *   creates a goal definition and starts its run: the maker ⇄ verifier loop that
 *   re-attempts until the verifier is satisfied or the iteration fuse parks it.
 *
 * Risky actions are still caught later by the approval gate.
 */
export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const { mutate: createTask, isPending: creatingTask } =
    useCreateTaskMutation();
  const { mutate: createGoal, isPending: creatingGoal } =
    useCreateGoalMutation();
  const { mutate: startGoal, isPending: startingGoal } = useStartGoalMutation();
  const { data: limits } = useLimitsQuery();

  const [mode, setMode] = useState<TaskMode>("standard");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<SchedulePreset>("now");
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);
  const [loop, setLoop] = useState<LoopFormState>(INITIAL_LOOP_STATE);

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

  const canSubmit =
    mode === "loop" ? canSubmitLoop(loop) : text.trim().length > 2;

  const patchLoop = useCallback(
    (patch: Partial<LoopFormState>) => setLoop((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleSubmit = useCallback(() => {
    if (text.trim().length <= 2 || busy) return;
    createTask(
      {
        body: {
          title: title.trim() || undefined,
          text,
          paths,
          scheduledAt: resolveScheduledAt(preset, now, resetsAt),
        },
      },
      {
        onSuccess: (res) => {
          const result = selectApiResponseBody(res);
          if (result.outcome === "dispatched") {
            // A live run now exists — open it on the runs page.
            router.push(`/runs?run=${encodeURIComponent(result.runRef)}`);
            onClose();
            return;
          }
          // Deferred: confirm when it will fire, then close.
          setScheduledWhen(whenLabel(result.task.scheduledAt, now));
          setTimeout(onClose, CONFIRM_LINGER_MS);
        },
      },
    );
  }, [busy, createTask, title, text, paths, preset, now, resetsAt, router, onClose]);

  const handleLoopSubmit = useCallback(() => {
    if (!canSubmitLoop(loop) || busy) return;
    const goalId = makeGoalId(title.trim() || loop.objective, now);
    const files = extractPaths(loop.objective);
    createGoal(
      { body: buildCreateGoalBody(loop, goalId, title) },
      {
        onSuccess: () => {
          // The goal definition exists — start its run (the outer loop).
          startGoal(
            {
              params: { id: goalId },
              body: {
                title: title.trim() || undefined,
                files: files.length > 0 ? files : undefined,
              },
            },
            {
              onSuccess: (res) => {
                const run = selectApiResponseBody(res);
                router.push(`/runs?run=${encodeURIComponent(run.goalRunId)}`);
                onClose();
              },
            },
          );
        },
      },
    );
  }, [loop, busy, title, now, createGoal, startGoal, router, onClose]);

  const handleRemovePath = useCallback((path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
  }, []);

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

  const onSubmit = mode === "loop" ? handleLoopSubmit : handleSubmit;

  // The submit label/icon track the active mode (and, for standard, deferral).
  let submitLabel: string;
  let submitIcon: "play" | "clock" | "retry";
  if (mode === "loop") {
    submitLabel = t("loop.submit");
    submitIcon = "retry";
  } else if (scheduledAt !== null) {
    submitLabel = t("schedule.submit");
    submitIcon = "clock";
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
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </Stack>
  );

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
      <Tabs onValueChange={(v) => setMode(v as TaskMode)} value={mode}>
        <TabList>
          <Tab value="standard">{t("tabs.standard")}</Tab>
          <Tab value="loop">{t("tabs.loop")}</Tab>
        </TabList>

        <TabPanel value="standard">
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

            <ScheduleField
              now={now}
              onChange={setPreset}
              resetsAt={resetsAt}
              value={preset}
            />
          </Stack>
        </TabPanel>

        <TabPanel value="loop">
          <Stack gap="150">
            <TextInputField
              label={t("title.label")}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("title.placeholder")}
              value={title}
            />

            <LoopComposer onChange={patchLoop} state={loop} />
          </Stack>
        </TabPanel>
      </Tabs>
    </Dialog>
  );
}
