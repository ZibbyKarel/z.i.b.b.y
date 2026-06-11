"use client";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useLimitsQuery } from "../../limits/queries/useLimitsQuery";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useCreateTaskMutation } from "../mutations";
import { type SchedulePreset, extractPaths, resolveScheduledAt, whenLabel } from "../task";
import { ScheduleField } from "./ScheduleField";
import { TaskComposer } from "./TaskComposer";

export interface NewTaskDialogProps {
  onClose: () => void;
}

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

/**
 * The whole New Task flow in one modal — name (optional) → describe → choose when →
 * one click. An immediate task classifies in the background, hands straight to the
 * routed agent or pipeline, and redirects to the new run's detail. A delayed task
 * (In 1 h / When limits reset) is parked server-side; the dialog confirms when it
 * will fire, then closes. Risky actions are still caught later by the approval gate.
 */
export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const createTask = useCreateTaskMutation();
  const { data: limits } = useLimitsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<SchedulePreset>("now");
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);

  // A stable "now" for the dialog's lifetime: presets resolve against it and the
  // limit-reset option gates on it, so display and submit agree.
  const [now] = useState(() => Date.now());
  const resetsAt = limits?.rolling.resetsAt ?? null;

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const busy = createTask.isPending;
  const canSubmit = text.trim().length > 2;
  const scheduledAt = resolveScheduledAt(preset, now, resetsAt);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || busy) return;
    createTask.mutate(
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
  }, [canSubmit, busy, createTask, title, text, paths, preset, now, resetsAt, router, onClose]);

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

  // A deferred choice runs later — relabel the submit so it reads "Schedule".
  const submitLabel = scheduledAt !== null ? t("schedule.submit") : t("classifyRun");

  const actions = (
    <Stack grow align="center" direction="row" gap="100" justify="end">
      <Button icon="x" intent="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
      <Button
        disabled={!canSubmit}
        icon={scheduledAt !== null ? "clock" : "play"}
        intent="primary"
        loading={busy}
        onClick={handleSubmit}
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

        <ScheduleField now={now} onChange={setPreset} resetsAt={resetsAt} value={preset} />
      </Stack>
    </Dialog>
  );
}
