"use client";
import {
  Accordion,
  AccordionItem,
  Button,
  Container,
  Dialog,
  IconTile,
  Panel,
  SelectField,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { TaskOutput } from "@zibby/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useCreateGoalMutation } from "../../goals/mutations";
import { useLimitsQuery } from "../../limits/queries/useLimitsQuery";
import { useCreateProjectMutation } from "../../projects/mutations";
import { useProjectsQuery } from "../../projects/queries/useProjectsQuery";
import {
  INITIAL_LOOP_STATE,
  type LoopFormState,
  buildCreateGoalBody,
  canSubmitLoop,
  makeGoalId,
  proposedGoalToLoopState,
  slugify,
} from "../loop";
import { useClassifyTaskMutation, useCreateTaskMutation } from "../mutations";
import {
  type SchedulePreset,
  type TaskRouting,
  type TaskTarget,
  basename,
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
  /**
   * Pre-select a destination in the standard composer. Used when the operator picks
   * the processor up front — e.g. "Run pipeline" opens the dialog with that pipeline
   * already chosen in the "Edit" target picker. Classification still runs (the normal
   * flow), the chosen target heads the preview, and the operator can change it — it is
   * a pre-fill, not a lock.
   */
  initialTarget?: TaskTarget;
}

/** How long the scheduled confirmation lingers before the dialog closes itself. */
const CONFIRM_LINGER_MS = 1600;

/** Debounce before the live classify preview fires while the operator types. */
const CLASSIFY_DEBOUNCE_MS = 350;

/** A stable key for a target, used to pre-select and dedupe entries in the picker. */
function targetKey(target: TaskTarget): string {
  return target.kind === "orchestrator" ? "orchestrator" : `${target.kind}:${target.id}`;
}

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
export function NewTaskDialog({ onClose, initialText, initialTarget }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const { mutate: createTask, isPending: creatingTask } = useCreateTaskMutation();
  const { mutate: classify } = useClassifyTaskMutation();
  const { mutate: createGoal, isPending: creatingGoal } = useCreateGoalMutation();
  const { mutate: createProject, isPending: granting } = useCreateProjectMutation();
  const { data: limits } = useLimitsQuery();
  const { data: projects } = useProjectsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState(initialText ?? "");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  /** Selected project id (its `path` is folded into `paths` like a typed path), or "" for none. */
  const [projectId, setProjectId] = useState<string>("");
  const [preset, setPreset] = useState<SchedulePreset>("now");
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);

  // The terminal output the operator wants for this task (the dialog selector). "" =
  // inherit (the default — a pipeline keeps its own outputs, an agent delivers nothing).
  const [outputType, setOutputType] = useState<"" | "pr" | "file" | "void">("");
  const [fileDest, setFileDest] = useState<"project" | "vault">("project");
  const [fileTo, setFileTo] = useState("");

  const [routing, setRouting] = useState<TaskRouting | null>(null);
  const [loop, setLoop] = useState<LoopFormState>(INITIAL_LOOP_STATE);
  const [loopEdited, setLoopEdited] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);
  /**
   * The chosen single-dispatch target, as a {@link targetKey}. "" = auto (let the
   * classifier decide). Seeded from `initialTarget` so "Run pipeline" pre-selects the
   * pipeline; the operator can switch it to another candidate or back to auto.
   */
  const [chosenKey, setChosenKey] = useState<string>(initialTarget ? targetKey(initialTarget) : "");
  /** Phase 11.3: the out-of-project path awaiting an explicit "grant access" confirm. */
  const [pendingGrant, setPendingGrant] = useState<string | null>(null);

  // A stable "now" for the dialog's lifetime: presets resolve against it, the
  // limit-reset option gates on it, and the goal id's uniqueness suffix uses it.
  const [now] = useState(() => Date.now());
  const resetsAt = limits?.rolling.resetsAt ?? null;

  // The project a `project` selection resolves to (its `path` joins `paths`).
  const selectedProject = useMemo(
    () => (projectId ? (projects ?? []).find((p) => p.id === projectId) ?? null : null),
    [projects, projectId],
  );

  // Detected paths plus the selected project's path — the project's folder is used
  // exactly like a path the operator typed into the description (dedup, removable).
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    const all = selectedProject ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)].filter((p) => !removedPaths.has(p));
  }, [text, removedPaths, selectedProject]);
  const busy = creatingTask || creatingGoal || granting;
  const scheduledAt = resolveScheduledAt(preset, now, resetsAt);
  // Gate the preview on a long-enough query so a stale verdict never lingers after
  // the field is cleared (no setState-in-effect needed to reset it).
  const hasQuery = text.trim().length > 2;
  const activeRouting = hasQuery ? routing : null;

  // The targets the picker offers: the pre-selected one (if any) plus the live
  // classify candidates, deduped — the seeded target is always present, so it never
  // falls out of the list when candidates change.
  const allTargets = useMemo(() => {
    const list: TaskTarget[] = [];
    const seen = new Set<string>();
    for (const target of [...(initialTarget ? [initialTarget] : []), ...(activeRouting?.candidates ?? [])]) {
      const key = targetKey(target);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(target);
      }
    }
    return list;
  }, [initialTarget, activeRouting]);

  // The effective single-dispatch target: an explicit pick, or null (auto → classify).
  const chosenTarget = chosenKey ? allTargets.find((target) => targetKey(target) === chosenKey) ?? null : null;
  // An explicit pick is always a one-shot dispatch — a loop is only inferred in auto mode.
  const isLoop = !chosenTarget && activeRouting?.mode === "loop";

  // The side-effect-free verdict (the backend never starts a run here). Reused by the
  // debounce below and by the grant flow (re-resolve a path once it's a project).
  const runClassify = useCallback(() => {
    classify(
      { body: { text, paths } },
      { onSuccess: (res) => setRouting(toClientRouting(selectApiResponseBody(res))) },
    );
  }, [classify, text, paths]);

  // ── Live classify preview ───────────────────────────────────────────────
  // Runs even with a pre-selected target: it populates the alternatives the picker
  // offers (so the choice stays changeable) and resolves the typed paths.
  useEffect(() => {
    if (text.trim().length <= 2) return;
    const handle = setTimeout(runClassify, CLASSIFY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, runClassify]);

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

  // Project the selector onto the wire `output`. "" = inherit (omit the field). A
  // `file` with no name yet projects to nothing — the submit guard blocks that case so
  // the choice is never silently dropped.
  const output: TaskOutput | undefined = useMemo(() => {
    if (outputType === "pr") return { type: "pr" };
    if (outputType === "void") return { type: "void" };
    if (outputType === "file" && fileTo.trim())
      return { type: "file", dest: fileDest, to: fileTo.trim() };
    return undefined;
  }, [outputType, fileDest, fileTo]);

  const submitSingle = useCallback(() => {
    // An explicit pick (pre-selected or chosen) sends a target; auto omits it so the
    // backend classifies — byte-for-byte the un-seeded behaviour.
    createTask(
      {
        body: {
          title: title.trim() || undefined,
          text,
          paths,
          scheduledAt,
          ...(chosenTarget ? { target: toApiTarget(chosenTarget) } : {}),
          ...(output ? { output } : {}),
        },
      },
      { onSuccess: handleCreateTaskSuccess },
    );
  }, [chosenTarget, createTask, title, text, paths, scheduledAt, output, handleCreateTaskSuccess]);

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
                text,
                paths,
                scheduledAt,
                target: { kind: "goal", id: goalId, name: body.name ?? seed.slice(0, 80) },
              },
            },
            { onSuccess: handleCreateTaskSuccess },
          );
        },
      },
    );
  }, [loop, title, now, scheduledAt, text, paths, createGoal, createTask, handleCreateTaskSuccess]);

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

  const handleRemovePath = useCallback(
    (path: string) => {
      // The project's own path is owned by the selector — removing its chip
      // deselects the project (keeps chip + dropdown in sync, re-selectable).
      if (path === selectedProject?.path) {
        setProjectId("");
        return;
      }
      setRemovedPaths((prev) => new Set(prev).add(path));
    },
    [selectedProject],
  );

  // ── Grant a folder (Phase 11.3, Law 1) ───────────────────────────────────
  // The "grant access" chip surfaces the path; the operator's CONFIRM is the act
  // that registers it as a workspace root (createProject). No autonomous surface can
  // reach this — the run simply has no folder scope until the operator grants it.
  const confirmGrant = useCallback(() => {
    if (pendingGrant === null) return;
    const path = pendingGrant;
    const name = basename(path) || path;
    createProject(
      { body: { id: slugify(name) || "workspace", name, path } },
      {
        onSuccess: () => {
          setPendingGrant(null);
          // Re-resolve so the chip flips from "grant access" to "scoped to <name>".
          runClassify();
        },
      },
    );
  }, [pendingGrant, createProject, runClassify]);

  // A chosen `file` output needs a filename — else block, so the selection can't be
  // silently dropped on submit.
  const outputReady = isLoop || outputType !== "file" || fileTo.trim().length > 0;
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

  // The "ZIBBY will…" preview reflects the *effective* target: an explicit pick (the
  // pre-selected pipeline or a chosen candidate) shown as a one-shot dispatch; else
  // the live classify verdict as-is. So the preview and the dispatch never drift.
  const previewRouting: TaskRouting | null = chosenTarget
    ? {
        target: chosenTarget,
        confidence: 1,
        reason: t("target.chosenReason"),
        matchedTerms: [],
        candidates: activeRouting?.candidates ?? [chosenTarget],
        mode: "single",
        proposedGoal: null,
        paths: activeRouting?.paths ?? [],
      }
    : activeRouting;

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
          onChange={setText}
          onGrant={setPendingGrant}
          onRemovePath={handleRemovePath}
          onSubmit={handleSubmit}
          paths={paths}
          resolved={activeRouting?.paths}
          value={text}
        />

        {pendingGrant !== null && (
          <Panel padding="100">
            <Stack gap="100">
              <Typography size="sm" type="text">
                {t("paths.grantConfirm", { folder: basename(pendingGrant) || pendingGrant })}
              </Typography>
              <Stack align="center" direction="row" gap="100" justify="end">
                <Button icon="x" intent="ghost" onClick={() => setPendingGrant(null)}>
                  {t("paths.grantCancel")}
                </Button>
                <Button
                  icon="shield"
                  intent="primary"
                  loading={granting}
                  onClick={confirmGrant}
                >
                  {t("paths.grantConfirmYes")}
                </Button>
              </Stack>
            </Stack>
          </Panel>
        )}

        {previewRouting && <PlanPreview routing={previewRouting} />}

        {(activeRouting || initialTarget) && (
          <Accordion>
            <AccordionItem defaultExpanded={!!initialTarget} summary={t("edit.label")}>
              {isLoop ? (
                <LoopComposer onChange={patchLoop} state={loop} />
              ) : (
                <SelectField
                  hint={t("override.hint")}
                  label={t("override.label")}
                  onValueChange={setChosenKey}
                  options={targetOptions}
                  value={chosenKey}
                />
              )}
            </AccordionItem>
          </Accordion>
        )}

        {!isLoop && (
          <Stack gap="100">
            <SelectField
              hint={t("output.hint")}
              label={t("output.label")}
              onValueChange={(v) => setOutputType(v as typeof outputType)}
              options={[
                { value: "", label: t("output.auto") },
                { value: "pr", label: t("output.pr") },
                { value: "file", label: t("output.file") },
                { value: "void", label: t("output.void") },
              ]}
              value={outputType}
            />
            {outputType === "file" && (
              <>
                <SelectField
                  label={t("output.destLabel")}
                  onValueChange={(v) => setFileDest(v as "project" | "vault")}
                  options={[
                    { value: "project", label: t("output.destProject") },
                    { value: "vault", label: t("output.destVault") },
                  ]}
                  value={fileDest}
                />
                <TextInputField
                  label={t("output.toLabel")}
                  onChange={(e) => setFileTo(e.target.value)}
                  placeholder={t("output.toPlaceholder")}
                  value={fileTo}
                />
              </>
            )}
          </Stack>
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
