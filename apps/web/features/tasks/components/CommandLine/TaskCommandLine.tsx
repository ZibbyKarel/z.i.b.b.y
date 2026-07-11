"use client";
import type { TaskOutput } from "@zibby/contracts";
import {
  Button,
  DropDownButton,
  type DropDownButtonItem,
  type IconName,
  OrbitLoader,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLimitsQuery } from "../../../limits";
import { useProjectsQuery } from "../../../projects";
import { type TaskSubmitResult, useTaskSubmit } from "../../hooks/useTaskSubmit";
import { INITIAL_LOOP_STATE, type LoopFormState, canSubmitLoop } from "../../loop";
import {
  type SchedulePreset,
  type TaskTarget,
  type TaskTargetKind,
  clockLabel,
  extractPaths,
  resolveScheduledAt,
} from "../../task";
import { ScheduledConfirmation } from "../ScheduledConfirmation";
import type { TaskAttachmentSet } from "../TaskAttachments";
import { CommandLine } from "./CommandLine";

export enum TaskCommandLineTestId {
  Root = "task-command-line-root",
  AckRow = "task-command-line-ack-row",
  AckDismiss = "task-command-line-ack-dismiss",
}

/** The honest, non-fabricated classification ack shown below the box after submit —
 *  ported verbatim from today's `CommandLine`'s own `AckInfo`. */
interface AckInfo {
  text: string;
  kind: string;
  exec: string;
}

function noop() {
  /* no-op default for TaskCommandLine's onClose */
}

export interface TaskCommandLineProps {
  /** An optional task title — passed straight through to the dispatched body. */
  title?: string;
  /** An optional terminal-output choice — passed straight through (undefined = inherit). */
  output?: TaskOutput;
  /** Phase 109: the operator's confirmed tool-grant set, passed straight through
   *  into `useTaskSubmit`'s dispatched body. Undefined/empty omits the field. */
  toolGrants?: string[];
  /** Prior-run context ("Continue in a new task") appended to the dispatched text. */
  context?: string;
  /** True when the caller's own live classify verdict says this text synthesizes a
   *  loop — flips the run control to "Run loop" and routes dispatch through the goal
   *  creation path. Defaults to false. */
  isLoop?: boolean;
  /** The Loop form state — read when `isLoop` is true. */
  loop?: LoopFormState;
  /** Show the compact classification ack row once a submit goes out. Default `false`. */
  showAck?: boolean;
  /** Fired with the raw create-task result as soon as it lands. */
  onLaunched?: (result: TaskSubmitResult) => void;
  /** Called once the launch settles. Defaults to a no-op. */
  onClose?: () => void;
  /** The one-shot seed for the per-task project scope. Defaults to `null`. */
  initialProjectId?: string | null;
  /** Mirrors the per-task project selection up whenever it changes. */
  onProjectChange?: (id: string | null) => void;

  // Presentational pass-throughs, forwarded verbatim to the generic `CommandLine`.
  rows?: number;
  maxRows?: number;
  placeholder?: string;
  label?: string;
  initialText?: string;
  initialTarget?: TaskTarget;
  disabled?: boolean;
  chrome?: boolean;
  suggestions?: string[];
  showAttach?: boolean;
  submitLabel?: string;
  injectedTarget?: TaskTarget;
  onInjectedTargetConsumed?: () => void;
  onTextChange?: (text: string) => void;
  onTargetChange?: (target: TaskTarget | undefined) => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onAttachmentsChange?: (set: TaskAttachmentSet) => void;
}

/**
 * The task-launch CONTAINER (Phase 118b): composes the generic {@link CommandLine} —
 * which owns only the draft (text, `@`-mention target, attachments, highlights) — with
 * everything task-launch: {@link useTaskSubmit}, the schedule split-button, the project
 * scope, the loop path, and the honest classification ack row. A faithful relocation of
 * what used to be `CommandLine`'s own default (non-`onSubmit`) behaviour — see phase-118
 * plan — not a redesign.
 *
 * Mirrors `CommandLine`'s emitted draft (`onTextChange`/`onTargetChange`/
 * `onAttachmentsChange`/`onProjectChange`) into local state so `useTaskSubmit` — which
 * stays render-configured and unchanged — can be fed exactly as it was fed before, and
 * dispatches from that mirror rather than from `CommandLine`'s own internal state.
 * `CommandLine` is composed with `onSubmit`/`resetOnSubmit={false}` purely as an Enter-key
 * trigger; the actual dispatch (including scheduling and the loop path) is driven directly
 * from the split-button `renderTrailing` slot.
 */
export function TaskCommandLine({
  title = "",
  output,
  toolGrants,
  context,
  isLoop = false,
  loop = INITIAL_LOOP_STATE,
  showAck = false,
  onLaunched,
  onClose = noop,
  initialProjectId,
  onProjectChange,
  rows,
  maxRows,
  placeholder,
  label,
  initialText,
  initialTarget,
  disabled = false,
  chrome,
  suggestions,
  showAttach,
  submitLabel,
  injectedTarget,
  onInjectedTargetConsumed,
  onTextChange,
  onTargetChange,
  onDraftChange,
  onAttachmentsChange,
}: TaskCommandLineProps) {
  const t = useTranslations("tasks");

  // Mirrors of CommandLine's own internal draft — each setter ALSO forwards to the
  // same-named prop so an embedding parent (e.g. NewTaskDialog's classify preview)
  // keeps receiving onTextChange/onTargetChange/onProjectChange exactly as before.
  // Seed with the SAME initializer the generic CommandLine uses for its own `text`
  // (an `initialTarget` prefixes `@Name ` into the initial text) so the mirror matches
  // what the generic displays on mount — the generic does NOT emit `onTextChange` on
  // mount, so seeding `initialText` alone would leave the two desynced (a disabled Run
  // control / missing seed paths) until the first keystroke.
  const [draftText, setDraftText] = useState(() => {
    const base = initialText ?? "";
    if (!initialTarget) return base;
    const mention = `@${initialTarget.name} `;
    return base.length > 0 ? `${mention}${base}` : mention;
  });
  const [draftTarget, setDraftTarget] = useState<TaskTarget | undefined>(initialTarget);
  const [draftAttachments, setDraftAttachments] = useState<TaskAttachmentSet>({ files: [] });
  const [taskProjectId, setTaskProjectId] = useState<string | null>(() => initialProjectId ?? null);
  const [ack, setAck] = useState<AckInfo | null>(null);
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);
  // A stable "now" for this instance's lifetime — presets and the goal id's uniqueness
  // suffix resolve against it (lazy: Date.now() in render is lint-banned).
  const [now] = useState(() => Date.now());

  const { data: projects = [] } = useProjectsQuery();
  const selectedProject = useMemo(
    () => (taskProjectId ? (projects.find((p) => p.id === taskProjectId) ?? null) : null),
    [projects, taskProjectId],
  );
  const { data: limits } = useLimitsQuery();
  const resetsAt = limits?.rolling.resetsAt ?? null;

  const paths = useMemo(() => {
    const detected = extractPaths(draftText);
    const all = selectedProject?.path ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)];
  }, [draftText, selectedProject]);

  // The dispatched description: the operator's text plus, when continuing from a
  // prior run, that run's output appended as a labelled context block — ported
  // verbatim from today's CommandLine (never folded twice: the generic below never
  // receives `context`).
  const composedText = useMemo(
    () => (context ? `${draftText.trim()}\n\n---\n${t("context.heading")}\n${context}` : draftText),
    [draftText, context, t],
  );

  const { handleSubmit, busy } = useTaskSubmit({
    title,
    composedText,
    paths,
    attachmentSetId: draftAttachments.attachmentSetId,
    output,
    toolGrants,
    chosenTarget: draftTarget ?? null,
    isLoop,
    loop,
    now,
    text: draftText,
    onClose,
    setScheduledWhen,
    onLaunched,
  });

  const ackKindLabel: Record<TaskTargetKind, string> = {
    agent: t("commandLine.ack.kind.agent"),
    pipeline: t("commandLine.ack.kind.pipeline"),
    goal: t("commandLine.ack.kind.goal"),
    chain: t("commandLine.ack.kind.chain"),
    subsystem: t("commandLine.ack.kind.subsystem"),
    orchestrator: t("commandLine.ack.kind.orchestrator"),
  };

  const canRun = !disabled && (isLoop ? canSubmitLoop(loop) : draftText.trim().length > 2);

  /** The honest ack built from what's already known at the moment of submit — never a
   *  fabricated backend verdict. Ported verbatim from today's CommandLine. */
  function buildAck(): AckInfo | null {
    if (!canRun || busy) return null;
    if (isLoop) {
      return {
        text: draftText,
        kind: t("commandLine.ack.kind.loop"),
        exec: title.trim() || loop.objective || t("commandLine.ack.execFallback"),
      };
    }
    if (draftTarget) {
      return { text: draftText, kind: ackKindLabel[draftTarget.kind], exec: draftTarget.name };
    }
    return { text: draftText, kind: t("commandLine.ack.kind.auto"), exec: t("commandLine.ack.execPending") };
  }

  /** Every submit path (Enter via the generic's onSubmit, the primary run action, or a
   *  schedule-menu item) funnels through here so the ack row — when enabled — always
   *  reflects the actual dispatch, computed at the same moment it fires. */
  function dispatch(scheduledAt: number | null) {
    if (showAck) {
      const info = buildAck();
      if (info) setAck(info);
    }
    handleSubmit(scheduledAt);
  }

  function run(preset: SchedulePreset) {
    dispatch(resolveScheduledAt(preset, now, resetsAt));
  }

  function handleTextChange(next: string) {
    setDraftText(next);
    onTextChange?.(next);
  }

  function handleTargetChange(next: TaskTarget | undefined) {
    setDraftTarget(next);
    onTargetChange?.(next);
  }

  function handleAttachmentsChange(next: TaskAttachmentSet) {
    setDraftAttachments(next);
    onAttachmentsChange?.(next);
  }

  /** Updates the LOCAL per-task project scope only — never mirrors up to any
   *  app-wide scope (there isn't one) — and reports the change via onProjectChange. */
  function handleProjectChange(id: string | null) {
    setTaskProjectId(id);
    onProjectChange?.(id);
  }

  const menuItems: DropDownButtonItem[] = [
    { id: "in-1h", label: t("schedule.in1h"), icon: "clock", onSelect: () => run("in-1h") },
    ...(resetsAt !== null && resetsAt > now
      ? [
          {
            id: "limit-reset",
            label: t("schedule.limitReset", { time: clockLabel(resetsAt) }),
            icon: "clock" as const,
            onSelect: () => run("limit-reset"),
          },
        ]
      : []),
  ];

  /** The schedule split-button — ignores the generic's own `{ canSubmit, submit }` api
   *  entirely and dispatches directly off the mirror instead, so scheduling and an
   *  empty-text loop dispatch both work without the generic ever knowing about either. */
  function renderTrailingControl(): ReactNode {
    const runIcon: IconName = isLoop ? "retry" : "play";
    const runLabel = submitLabel ?? (isLoop ? t("loop.submit") : t("classifyRun"));
    return (
      <DropDownButton
        disabled={!canRun || busy}
        icon={runIcon}
        intent="primary"
        label={runLabel}
        loading={busy}
        menuAriaLabel={t("commandLine.moreRunOptions")}
        menuItems={menuItems}
        onClick={() => dispatch(null)}
        size="sm"
      />
    );
  }

  if (scheduledWhen !== null) return <ScheduledConfirmation when={scheduledWhen} />;

  return (
    <Stack data-testid={TaskCommandLineTestId.Root} direction="col" gap="150">
      <CommandLine
        chrome={chrome}
        disabled={disabled}
        initialProjectId={initialProjectId}
        initialTarget={initialTarget}
        initialText={initialText}
        injectedTarget={injectedTarget}
        label={label}
        maxRows={maxRows}
        onAttachmentsChange={handleAttachmentsChange}
        onDraftChange={onDraftChange}
        onInjectedTargetConsumed={onInjectedTargetConsumed}
        onProjectChange={handleProjectChange}
        onSubmit={() => dispatch(null)}
        onTargetChange={handleTargetChange}
        onTextChange={handleTextChange}
        placeholder={placeholder}
        renderTrailing={renderTrailingControl}
        resetOnSubmit={false}
        rows={rows}
        showAttach={showAttach}
        submitLabel={submitLabel}
        suggestions={suggestions}
      />

      {showAck && ack && (
        <Stack align="center" data-testid={TaskCommandLineTestId.AckRow} direction="row" gap="150">
          <OrbitLoader size="sm" />
          <Stack grow gap="25" style={{ minWidth: 0 }}>
            <Typography size="sm" type="note">
              {t("commandLine.ack.headline", { kind: ack.kind, exec: ack.exec })}
            </Typography>
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {t("commandLine.ack.quoted", { text: ack.text })}
            </Typography>
          </Stack>
          <Button
            aria-label={t("commandLine.ack.dismissAria")}
            data-testid={TaskCommandLineTestId.AckDismiss}
            icon="x"
            intent="ghost"
            onClick={() => setAck(null)}
            size="sm"
          />
        </Stack>
      )}
    </Stack>
  );
}
