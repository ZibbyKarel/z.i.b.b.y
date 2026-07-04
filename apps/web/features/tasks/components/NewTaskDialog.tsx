"use client";
import type { Attachment } from "@zibby/contracts";
import {
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
import { useMemo, useState } from "react";
import { useLimitsQuery } from "../../limits";
import { useProjectsQuery } from "../../projects";
import { useTaskClassification } from "../hooks/useTaskClassification";
import { useTaskOutput } from "../hooks/useTaskOutput";
import { useTaskSchedule } from "../hooks/useTaskSchedule";
import { useTaskSubmit } from "../hooks/useTaskSubmit";
import { canSubmitLoop } from "../loop";
import { type TaskTarget, extractPathRanges, extractPaths, targetKey } from "../task";
import { LoopComposer } from "./LoopComposer";
import { PlanPreview } from "./PlanPreview";
import { ScheduleField } from "./ScheduleField";
import { ScheduledConfirmation } from "./ScheduledConfirmation";
import { TaskAttachments } from "./TaskAttachments";
import { TaskComposer } from "./TaskComposer";
import { TaskContextPanel } from "./TaskContextPanel";
import { TaskOutputField } from "./TaskOutputField";

export interface NewTaskDialogProps {
  onClose: () => void;
  /** Phase 11.4: seed the description field (a voice transcript / external trigger). */
  initialText?: string;
  /**
   * Pre-select a destination in the standard composer. Used when the operator picks
   * the processor up front — e.g. "Run pipeline" opens the dialog with that pipeline
   * already chosen in the "Edit" target picker. Classification still runs (the normal
   * flow), the chosen target heads the preview, and the operator can change it — it is
   * a pre-fill, not a lock.
   */
  initialTarget?: TaskTarget;
  /**
   * Prior-run output carried into this task ("Continue in a new task"): shown as a
   * read-only "context added" panel and folded into the dispatched description, so
   * the new run sees what the previous one produced.
   */
  initialContext?: string;
}

/**
 * The whole New Task flow in one modal (Phase 11): a single described intent. The
 * operator says what they want; a debounced classify shows a compact "ZIBBY will…"
 * {@link PlanPreview} — the *how* (single dispatch vs a synthesized loop) is inferred,
 * not chosen on a form. Advanced control survives behind an "Edit" disclosure (the
 * goal {@link LoopComposer} for a loop, a manual target picker for a low-confidence
 * single). File/folder paths referenced in the description are highlighted inline and
 * folded into the run's allowed directories automatically. Submitting dispatches a
 * task or — for a loop — creates the goal and starts its run. Risky actions are still
 * caught later by the approval gate.
 *
 * The heavy lifting lives in cohesive hooks ({@link useTaskClassification},
 * {@link useTaskOutput}, {@link useTaskSchedule}, {@link useTaskSubmit}) and the
 * composer / output / context subcomponents — this component just wires them together.
 */
export function NewTaskDialog({
  onClose,
  initialText,
  initialTarget,
  initialContext,
}: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const { data: limits } = useLimitsQuery();
  const { data: projects } = useProjectsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState(initialText ?? "");
  /** Selected project id (its `path` is folded into `paths`), or "" for none. */
  const [projectId, setProjectId] = useState<string>("");
  const [attachments, setAttachments] = useState<{
    attachmentSetId?: string;
    files: Attachment[];
  }>({ files: [] });

  // A stable "now" for the dialog's lifetime (lazy — Date.now() in render is lint-banned):
  // presets resolve against it, the limit-reset option gates on it, and the goal id's
  // uniqueness suffix uses it.
  const [now] = useState(() => Date.now());
  const resetsAt = limits?.rolling.resetsAt ?? null;

  // The project a `project` selection resolves to (its `path` joins `paths`).
  const selectedProject = useMemo(
    () => (projectId ? ((projects ?? []).find((p) => p.id === projectId) ?? null) : null),
    [projects, projectId],
  );

  // Every path referenced in the description — plus the selected project's folder — is
  // folded into the task's allowed directories. The typed ones are highlighted inline
  // in the composer; the project's folder is owned by the picker (deselect to drop it).
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    const all = selectedProject ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)];
  }, [text, selectedProject]);
  const highlights = useMemo(() => extractPathRanges(text), [text]);

  const {
    activeRouting,
    previewRouting,
    allTargets,
    chosenKey,
    setChosenKey,
    chosenTarget,
    isLoop,
    loop,
    patchLoop,
  } = useTaskClassification({ text, paths, initialTarget });

  const output = useTaskOutput();
  const { preset, setPreset, scheduledAt, scheduledWhen, setScheduledWhen } = useTaskSchedule({
    now,
    resetsAt,
  });

  // The dispatched description: the operator's text plus, when continuing from a prior
  // run, that run's output appended as a labelled context block — so the new run sees
  // what the previous one produced without the operator re-typing it.
  const composedText = useMemo(
    () =>
      initialContext ? `${text.trim()}\n\n---\n${t("context.heading")}\n${initialContext}` : text,
    [text, initialContext, t],
  );

  const { handleSubmit, busy } = useTaskSubmit({
    title,
    composedText,
    paths,
    attachmentSetId: attachments.attachmentSetId,
    scheduledAt,
    output: output.output,
    chosenTarget,
    isLoop,
    loop,
    now,
    text,
    onClose,
    setScheduledWhen,
  });

  // A chosen `file` output needs a filename — else block, so the selection can't be
  // silently dropped on submit.
  const outputReady = isLoop || output.outputReady;
  const canSubmit = (isLoop ? canSubmitLoop(loop) : text.trim().length > 2) && outputReady;

  const dialogAria = t("dialogTitle");
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
        ariaLabel={dialogAria}
        closeLabel={t("cancel")}
        onClose={onClose}
        title={header}
        width="lg"
      >
        <ScheduledConfirmation when={scheduledWhen} />
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

  const projectOptions = [
    { value: "", label: t("project.none") },
    ...(projects ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  const targetOptions = [
    { value: "", label: t("override.auto") },
    ...allTargets.map((target) => ({ value: targetKey(target), label: target.name })),
  ];

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={dialogAria}
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

        {initialContext && <TaskContextPanel context={initialContext} />}

        {(projects ?? []).length > 0 && (
          <SelectField
            hint={t("project.hint")}
            label={t("project.label")}
            onValueChange={setProjectId}
            options={projectOptions}
            value={projectId}
          />
        )}

        <TaskComposer
          highlights={highlights}
          onChange={setText}
          onSubmit={handleSubmit}
          value={text}
        />

        {previewRouting && <PlanPreview routing={previewRouting} />}

        {(activeRouting || initialTarget) &&
          (isLoop ? (
            <LoopComposer onChange={patchLoop} state={loop} />
          ) : (
            <SelectField
              hint={t("override.hint")}
              label={t("override.label")}
              onValueChange={setChosenKey}
              options={targetOptions}
              value={chosenKey}
            />
          ))}

        <TaskAttachments onChange={setAttachments} value={attachments} />

        {!isLoop && (
          <TaskOutputField
            fileDest={output.fileDest}
            fileTo={output.fileTo}
            onFileDestChange={output.setFileDest}
            onFileToChange={output.setFileTo}
            onOutputTypeChange={output.setOutputType}
            outputType={output.outputType}
          />
        )}

        <ScheduleField now={now} onChange={setPreset} resetsAt={resetsAt} value={preset} />
      </Stack>
    </Dialog>
  );
}
