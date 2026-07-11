"use client";
import { Button, Container, Dialog, IconTile, Stack, TextInputField, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useProjectsQuery } from "../../projects";
import { useTaskClassification } from "../hooks/useTaskClassification";
import { useTaskOutput } from "../hooks/useTaskOutput";
import { type TaskRouting, type TaskTarget, extractPaths } from "../task";
import { TaskCommandLine } from "./CommandLine/TaskCommandLine";
import { LoopComposer } from "./LoopComposer";
import { PlanPreview } from "./PlanPreview";
import { TaskContextPanel } from "./TaskContextPanel";
import { TaskOutputField } from "./TaskOutputField";
import { ToolGrantsField } from "./ToolGrantsField";

export interface NewTaskDialogProps {
  onClose: () => void;
  /** Phase 11.4: seed the description field (a voice transcript / external trigger). */
  initialText?: string;
  /**
   * Pre-select a destination in CommandLine's inline `@` picker. Used when the operator
   * picks the processor up front — e.g. "Run pipeline" opens the dialog with that
   * pipeline already assigned. Classification still runs (the normal flow), the chosen
   * target heads the preview, and the operator can change it — it is a pre-fill, not a
   * lock.
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
 * The whole New Task flow in one modal (Phase 11, collapsed onto the unified
 * {@link CommandLine} launcher in Phase 26): a single described intent, typed into one
 * growable input. The operator says what they want; a debounced classify shows a
 * compact "ZIBBY will…" {@link PlanPreview} — the *how* (single dispatch vs a
 * synthesized loop) is inferred, not chosen on a form. Assigning a destination is done
 * inline (typing `@Name` in the description opens CommandLine's own agent/pipeline
 * search — there is no separate override picker); a synthesized Loop still gets its own
 * {@link LoopComposer} editor, entered through the SAME run control CommandLine renders
 * (its label switches to "Run loop"). File/folder paths referenced in the description
 * are highlighted inline and folded into the run's allowed directories automatically.
 * Submitting dispatches a task or — for a loop — creates the goal and starts its run.
 * Risky actions are still caught later by the approval gate.
 *
 * `text`/`target`/`taskProjectId` below are MIRRORS of CommandLine's own internal
 * state (it owns the textarea, the `@`-mention picker, and the inline project
 * picker) — this dialog only needs them to drive the live classify preview and
 * to decide whether the Loop editor should appear; the actual dispatch happens
 * inside CommandLine via {@link useTaskSubmit}.
 */
export function NewTaskDialog({
  onClose,
  initialText,
  initialTarget,
  initialContext,
}: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const { data: projects } = useProjectsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState(initialText ?? "");
  const [target, setTarget] = useState<TaskTarget | undefined>(initialTarget);
  // Phase 109: the operator's confirmed tool-grant set — pre-checked to the
  // classifier's proposal, editable, threaded into the dispatched body below.
  const [checkedGrants, setCheckedGrants] = useState<string[]>([]);
  const [seededGrantsKey, setSeededGrantsKey] = useState<string | null>(null);
  // Phase 108: there is no app-wide "active project" scope any more — the
  // project is whatever CommandLine's own inline picker reports, mirrored up
  // here purely to drive this dialog's live preview (CommandLine folds the same
  // pick into the dispatched task's `paths` independently).
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => (taskProjectId ? ((projects ?? []).find((p) => p.id === taskProjectId) ?? null) : null),
    [projects, taskProjectId],
  );

  // Every path referenced in the description — plus the picked project's
  // folder — feeds the live classify preview below (CommandLine folds the same set
  // into the dispatched task's allowed directories independently).
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    const all = selectedProject?.path ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)];
  }, [text, selectedProject]);

  const { activeRouting, loop, patchLoop } = useTaskClassification({ text, paths, initialTarget });

  // An explicit `@`-mention pick always wins over the live classify verdict. Computed
  // directly here rather than through the hook's `chosenKey`/`allTargets` (which stays
  // scoped to `activeRouting.candidates`) because the mention picker reaches the WHOLE
  // agent/pipeline catalog — unlike the old "Předat" override select, it is never
  // limited to what the classifier itself ranked.
  const previewRouting: TaskRouting | null = target
    ? {
        target,
        confidence: 1,
        reason: t("target.chosenReason"),
        matchedTerms: [],
        candidates: activeRouting?.candidates ?? [target],
        mode: "single",
        proposedGoal: null,
        paths: activeRouting?.paths ?? [],
        toolGrants: activeRouting?.toolGrants ?? [],
      }
    : activeRouting;
  const isLoop = !target && activeRouting?.mode === "loop";

  // Seed the confirmed tool-grant set from a fresh proposal during render (the
  // same React-sanctioned "adjust state on prop change" pattern `useTaskClassification`
  // uses for the Loop form) — re-seeds only when the PROPOSAL itself changes, so an
  // operator edit (unchecking a box) survives an otherwise-identical re-render.
  const proposedGrants = previewRouting?.toolGrants ?? [];
  const proposedGrantsKey = JSON.stringify(proposedGrants);
  if (proposedGrantsKey !== seededGrantsKey) {
    setSeededGrantsKey(proposedGrantsKey);
    setCheckedGrants(proposedGrants);
  }

  const output = useTaskOutput();
  // A chosen `file` output needs a filename — else CommandLine's run control stays
  // disabled, so the selection can't be silently dropped on submit.
  const outputReady = isLoop || output.outputReady;

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

  const actions = (
    <Stack grow align="center" direction="row" justify="end">
      <Button icon="x" intent="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
    </Stack>
  );

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

        <TaskCommandLine
          chrome={false}
          context={initialContext}
          disabled={!outputReady}
          initialTarget={initialTarget}
          initialText={initialText}
          isLoop={isLoop}
          loop={loop}
          onClose={onClose}
          onProjectChange={setTaskProjectId}
          onTargetChange={setTarget}
          onTextChange={setText}
          output={output.output}
          rows={10}
          title={title}
          toolGrants={checkedGrants}
        />

        {previewRouting && <PlanPreview routing={previewRouting} />}

        {isLoop && <LoopComposer onChange={patchLoop} state={loop} />}

        {!isLoop && (
          <>
            <TaskOutputField
              fileDest={output.fileDest}
              fileTo={output.fileTo}
              onFileDestChange={output.setFileDest}
              onFileToChange={output.setFileTo}
              onOutputTypeChange={output.setOutputType}
              outputType={output.outputType}
            />
            <ToolGrantsField
              checked={checkedGrants}
              onChange={setCheckedGrants}
              toolIds={proposedGrants}
            />
          </>
        )}
      </Stack>
    </Dialog>
  );
}
