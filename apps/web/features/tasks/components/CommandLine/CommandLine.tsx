"use client";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TaskOutput } from "@zibby/contracts";
import {
  Button,
  Chip,
  Container,
  DropDownButton,
  type DropDownButtonItem,
  FilePreview,
  HighlightTextAreaField,
  type IconName,
  SearchMenu,
  type SearchMenuSection,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useAgentsQuery } from "../../../agents";
import { useLimitsQuery } from "../../../limits";
import { useActiveProject, useProjectsQuery } from "../../../projects";
import { usePipelinesQuery } from "../../../pipelines";
import { type TaskSubmitResult, useTaskSubmit } from "../../hooks/useTaskSubmit";
import { INITIAL_LOOP_STATE, type LoopFormState, canSubmitLoop } from "../../loop";
import {
  type SchedulePreset,
  type TaskTarget,
  clockLabel,
  extractPathRanges,
  extractPaths,
  resolveScheduledAt,
} from "../../task";
import { useUploadTaskAttachmentsMutation } from "../../mutations/useUploadTaskAttachmentsMutation";
import { ScheduledConfirmation } from "../ScheduledConfirmation";
import type { TaskAttachmentSet } from "../TaskAttachments";

export enum CommandLineTestId {
  Root = "command-line-root",
  Input = "command-line-input",
  Attach = "command-line-attach",
  FileInput = "command-line-file-input",
  MentionMenu = "command-line-mention-menu",
  TargetChip = "command-line-target-chip",
}

export interface CommandLineProps {
  /** Visible rows to start at — default 1 (a single growable line). */
  rows?: number;
  /** Hard cap the auto-grow won't exceed. */
  maxRows?: number;
  placeholder?: string;
  initialText?: string;
  initialTarget?: TaskTarget;
  /** An optional task title — passed straight through to the dispatched body. */
  title?: string;
  /** An optional terminal-output choice — passed straight through (undefined = inherit). */
  output?: TaskOutput;
  /** Prior-run context ("Continue in a new task") appended to the dispatched text. */
  context?: string;
  /** True when the caller's own live classify verdict says this text synthesizes a
   *  loop — flips the run control to "Run loop" and routes dispatch through the goal
   *  creation path. Defaults to false: a bare CommandLine always does a single dispatch. */
  isLoop?: boolean;
  /** The Loop form state — read when `isLoop` is true. */
  loop?: LoopFormState;
  /** An extra guard from the caller (e.g. an incomplete "write to a file" output
   *  choice) that blocks the run control regardless of the text/loop guard. */
  disabled?: boolean;
  /** Mirrors the live text up so an embedding parent can drive its own classify
   *  preview off the same value without owning the textarea itself. */
  onTextChange?: (text: string) => void;
  /** Mirrors the picked @-mention target (or its clearing) up to the parent. */
  onTargetChange?: (target: TaskTarget | undefined) => void;
  /** Mirrors the attached file set up — needed by a parent whose OWN submit path
   *  (e.g. a synthesized loop) must carry the same attachment set. */
  onAttachmentsChange?: (set: TaskAttachmentSet) => void;
  /** Fired with the raw create-task result as soon as it lands. */
  onLaunched?: (result: TaskSubmitResult) => void;
  /** Called once the launch settles: immediately for a dispatched/pending task, after
   *  the scheduled confirmation lingers for a deferred one. Defaults to a no-op — a
   *  standalone quick-launch has nothing to close. */
  onClose?: () => void;
}

/** Position (viewport px) the fixed mention picker is rendered at, above the input. */
interface MentionMenuRect {
  left: number;
  width: number;
  bottom: number;
}

/** True right after the operator types `@` at the start of the text or after
 * whitespace — the moment the mention picker should open (ported from ChatComposer). */
function isMentionTrigger(text: string, cursor: number): boolean {
  if (cursor === 0 || text[cursor - 1] !== "@") return false;
  return cursor === 1 || /\s/.test(text[cursor - 2] ?? "");
}

/** Case-insensitive substring match on a target's display name or id. */
function matchesQuery(query: string, name: string, id: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
}

/** Grows the visible row count with the text's line count, clamped to `[min, max]` —
 * a deterministic, layout-free heuristic (no scrollHeight measurement, which jsdom
 * can't report) that still gives the "starts at one line, grows as you type" feel. */
function computeRows(text: string, min: number, max: number): number {
  const lines = text.length === 0 ? 1 : text.split("\n").length;
  return Math.min(max, Math.max(min, lines));
}

function noop() {
  /* no-op default for CommandLine's onClose */
}

/**
 * The unified task launcher (Phase 26): one growable input that does everything —
 * free-text description, an inline `@` search to assign an agent/pipeline target,
 * a `+` button (and drag-and-drop) to attach files, and a trailing split-button to
 * run now / in 1 h / when limits reset. Composed entirely from DS primitives plus
 * the reused {@link HighlightTextAreaField} (path highlights), the `@`-mention
 * picker ported from `ChatComposer`, and {@link useTaskSubmit} (single dispatch, or
 * a synthesized loop when the caller passes `isLoop`/`loop` from its own classify).
 *
 * Per-range highlight tone was skipped (see Phase 26 plan) — only detected paths are
 * marked inline; a picked target renders as a closable `Chip` instead, which already
 * makes the assignment explicit without needing a second highlight colour.
 */
export function CommandLine({
  rows = 1,
  maxRows = 10,
  placeholder,
  initialText,
  initialTarget,
  title = "",
  output,
  context,
  isLoop = false,
  loop = INITIAL_LOOP_STATE,
  disabled = false,
  onTextChange,
  onTargetChange,
  onAttachmentsChange,
  onLaunched,
  onClose = noop,
}: CommandLineProps) {
  const t = useTranslations("tasks");
  const tMention = useTranslations("chat.mention");

  const [text, setText] = useState(initialText ?? "");
  const [target, setTarget] = useState<TaskTarget | undefined>(initialTarget);
  const [attachments, setAttachments] = useState<TaskAttachmentSet>({ files: [] });
  const [attachError, setAttachError] = useState<string | null>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [menuRect, setMenuRect] = useState<MentionMenuRect | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCursorRef = useRef<number | null>(null);

  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { activeProjectId } = useActiveProject();
  const { data: limits } = useLimitsQuery();
  const resetsAt = limits?.rolling.resetsAt ?? null;
  // A stable "now" for this instance's lifetime — presets and the goal id's
  // uniqueness suffix resolve against it (lazy: Date.now() in render is lint-banned).
  const [now] = useState(() => Date.now());

  const upload = useUploadTaskAttachmentsMutation();
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);

  // Once the mention picker is positioned (`menuRect` set synchronously in the
  // change handler below, landing in the SAME render as `mentionOpen`), move focus
  // into its own search input — SearchMenu owns its keyboard nav internally.
  useEffect(() => {
    if (mentionOpen && menuRect) mentionInputRef.current?.focus();
  }, [mentionOpen, menuRect]);

  // Hand focus back to the textarea once the picker closes (Escape/outside-click or
  // a selection), restoring the cursor a selection left behind.
  useEffect(() => {
    if (mentionOpen) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (pendingCursorRef.current !== null) {
      el.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  }, [mentionOpen]);

  const selectedProject = useMemo(
    () => (activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null),
    [projects, activeProjectId],
  );
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    const all = selectedProject ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)];
  }, [text, selectedProject]);
  const highlights = useMemo(() => extractPathRanges(text), [text]);

  // The dispatched description: the operator's text plus, when continuing from a
  // prior run, that run's output appended as a labelled context block.
  const composedText = useMemo(
    () => (context ? `${text.trim()}\n\n---\n${t("context.heading")}\n${context}` : text),
    [text, context, t],
  );

  const { handleSubmit, busy } = useTaskSubmit({
    title,
    composedText,
    paths,
    attachmentSetId: attachments.attachmentSetId,
    output,
    chosenTarget: target ?? null,
    isLoop,
    loop,
    now,
    text,
    onClose,
    setScheduledWhen,
    onLaunched,
  });

  function closeMention() {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMenuRect(null);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    const cursor = e.target.selectionStart ?? nextValue.length;
    setText(nextValue);
    onTextChange?.(nextValue);
    if (!mentionOpen && isMentionTrigger(nextValue, cursor)) {
      // Measure synchronously (the DOM is fully laid out inside this event handler)
      // so `menuRect` and `mentionOpen` land in the SAME render.
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuRect({
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + 8,
        });
      }
      setMentionStart(cursor - 1);
      setMentionQuery("");
      setMentionOpen(true);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(null);
    }
  }

  function selectMention(sectionId: string, itemId: string) {
    if (mentionStart === null) return;
    let picked: TaskTarget | undefined;
    if (sectionId === "agents") {
      const agent = agents.find((a) => a.id === itemId);
      if (agent) {
        picked = {
          kind: "agent",
          id: agent.id,
          name: agent.name ?? agent.id,
          glyph: (agent.glyph as IconName | undefined) ?? "bot",
        };
      }
    } else if (sectionId === "pipelines") {
      const pipeline = pipelines.find((p) => p.id === itemId);
      if (pipeline) picked = { kind: "pipeline", id: pipeline.id, name: pipeline.name, glyph: "flow" };
    }
    if (!picked) return;

    const mentionText = `@${picked.name} `;
    const start = mentionStart;
    const nextValue = text.slice(0, start) + mentionText + text.slice(start + 1);
    setText(nextValue);
    onTextChange?.(nextValue);
    setTarget(picked);
    onTargetChange?.(picked);
    pendingCursorRef.current = start + mentionText.length;
    closeMention();
  }

  function clearTarget() {
    setTarget(undefined);
    onTargetChange?.(undefined);
    textareaRef.current?.focus();
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setAttachError(null);
    try {
      const set = await upload.mutateAsync(files);
      const next: TaskAttachmentSet = { attachmentSetId: set.attachmentSetId, files: set.files };
      setAttachments(next);
      onAttachmentsChange?.(next);
    } catch {
      setAttachError(t("attachments.error"));
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void uploadFiles(files);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void uploadFiles(Array.from(e.dataTransfer.files ?? []));
  }

  function handleRemoveAttachments() {
    const next: TaskAttachmentSet = { files: [] };
    setAttachments(next);
    onAttachmentsChange?.(next);
  }

  function run(preset: SchedulePreset) {
    handleSubmit(resolveScheduledAt(preset, now, resetsAt));
  }

  const agentSection: SearchMenuSection = {
    id: "agents",
    label: tMention("sections.agents"),
    items: agents
      .filter((a) => matchesQuery(mentionQuery, a.name ?? a.id, a.id))
      .map((a) => ({ id: a.id, title: a.name ?? a.id, glyph: (a.glyph as IconName | undefined) ?? "bot" })),
  };
  const pipelineSection: SearchMenuSection = {
    id: "pipelines",
    label: tMention("sections.pipelines"),
    items: pipelines
      .filter((p) => matchesQuery(mentionQuery, p.name, p.id))
      .map((p) => ({ id: p.id, title: p.name, glyph: "flow" as IconName })),
  };

  const canRun = !disabled && (isLoop ? canSubmitLoop(loop) : text.trim().length > 2);
  const runLabel = isLoop ? t("loop.submit") : t("classifyRun");
  const runIcon: IconName = isLoop ? "retry" : "play";

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

  if (scheduledWhen !== null) return <ScheduledConfirmation when={scheduledWhen} />;

  return (
    <Stack
      data-testid={CommandLineTestId.Root}
      direction="col"
      gap="75"
      // Escape while the mention picker is focused must close ONLY the picker.
      onKeyDown={(e) => {
        if (mentionOpen && e.key === "Escape") e.stopPropagation();
      }}
    >
      {target && (
        <Stack align="center" direction="row" gap="75">
          <Chip
            closable
            closeLabel={tMention("removeAria")}
            data-testid={CommandLineTestId.TargetChip}
            onClose={clearTarget}
            tone="accent"
          >
            {target.name}
          </Chip>
        </Stack>
      )}

      <Container onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} position="relative" ref={rootRef}>
        {mentionOpen && menuRect && (
          <Container
            bottom={`${menuRect.bottom}px`}
            data-testid={CommandLineTestId.MentionMenu}
            left={`${menuRect.left}px`}
            position="fixed"
            width={`${menuRect.width}px`}
            zIndex={50}
          >
            <SearchMenu
              ariaLabel={tMention("ariaLabel")}
              emptyLabel={tMention("empty")}
              inputRef={mentionInputRef}
              onOpenChange={(open) => {
                if (!open) closeMention();
              }}
              onSelect={selectMention}
              onValueChange={setMentionQuery}
              open={mentionOpen}
              placeholder={tMention("placeholder")}
              sections={[agentSection, pipelineSection]}
              value={mentionQuery}
            />
          </Container>
        )}

        <Stack align="end" direction="row" gap="100">
          <input
            hidden
            multiple
            data-testid={CommandLineTestId.FileInput}
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type="file"
          />
          <Button
            aria-label={t("commandLine.attachAria")}
            data-testid={CommandLineTestId.Attach}
            icon="plus"
            intent="ghost"
            onClick={() => fileInputRef.current?.click()}
            size="sm"
          />

          <Stack grow style={{ minWidth: 0 }}>
            <HighlightTextAreaField
              autoFocus
              data-testid={CommandLineTestId.Input}
              disabled={disabled}
              highlights={highlights}
              label={t("commandLine.label")}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? t("commandLine.placeholder")}
              ref={textareaRef}
              rows={computeRows(text, rows, maxRows)}
              value={text}
            />
          </Stack>

          <DropDownButton
            disabled={!canRun || busy}
            icon={runIcon}
            intent="primary"
            label={runLabel}
            loading={busy}
            menuAriaLabel={t("commandLine.moreRunOptions")}
            menuItems={menuItems}
            onClick={() => handleSubmit(null)}
            size="sm"
          />
        </Stack>
      </Container>

      {(attachments.files.length > 0 || upload.isPending || attachError) && (
        <Stack gap="50">
          {upload.isPending && (
            <Typography size="xs" type="note" variant="tertiary">
              {t("attachments.uploading")}
            </Typography>
          )}
          {attachError && (
            <Typography size="xs" tone="bad" type="note">
              {attachError}
            </Typography>
          )}
          {attachments.files.map((file) => (
            <FilePreview
              key={file.name}
              mediaType={file.mediaType}
              name={file.name}
              onRemove={handleRemoveAttachments}
              size={file.size}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
