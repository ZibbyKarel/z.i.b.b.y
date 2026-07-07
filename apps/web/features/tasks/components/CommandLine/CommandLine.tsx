"use client";
import type { TaskOutput } from "@zibby/contracts";
import {
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  DropDownButton,
  type DropDownButtonItem,
  FilePreview,
  type HighlightRange,
  HighlightTextAreaField,
  type HighlightTone,
  Icon,
  type IconName,
  MenuSurface,
  OrbitLoader,
  Panel,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentsQuery } from "../../../agents";
import { useLimitsQuery } from "../../../limits";
import { usePipelinesQuery } from "../../../pipelines";
import { useActiveProject, useProjectsQuery } from "../../../projects";
import { type TaskSubmitResult, useTaskSubmit } from "../../hooks/useTaskSubmit";
import { INITIAL_LOOP_STATE, type LoopFormState, canSubmitLoop } from "../../loop";
import { useUploadTaskAttachmentsMutation } from "../../mutations/useUploadTaskAttachmentsMutation";
import {
  type SchedulePreset,
  type TaskTarget,
  type TaskTargetKind,
  clockLabel,
  extractPathRanges,
  extractPaths,
  resolveScheduledAt,
} from "../../task";
import { ScheduledConfirmation } from "../ScheduledConfirmation";
import type { TaskAttachmentSet } from "../TaskAttachments";

export enum CommandLineTestId {
  Root = "command-line-root",
  Input = "command-line-input",
  Attach = "command-line-attach",
  Pin = "command-line-pin",
  FileInput = "command-line-file-input",
  MentionMenu = "command-line-mention-menu",
  MentionItem = "command-line-mention-item",
  MentionEmpty = "command-line-mention-empty",
  TargetChip = "command-line-target-chip",
  Box = "command-line-box",
  DropOverlay = "command-line-drop-overlay",
  Suggestion = "command-line-suggestion",
  AckRow = "command-line-ack-row",
  AckDismiss = "command-line-ack-dismiss",
  Send = "command-line-send",
}

export interface CommandLineProps {
  /** Visible rows to start at — default 1 (a single growable line). */
  rows?: number;
  /** Hard cap the auto-grow won't exceed. */
  maxRows?: number;
  placeholder?: string;
  /** Overrides the input field's visible label — default "Task"/"Zadání". Chat
   *  passes its own "Message" wording so the label reflects what's actually
   *  being composed. */
  label?: string;
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
  /**
   * Wrap the input in the full velin-b panel chrome — an elevated `Panel` with a
   * header row (a spark/accent icon + "Zadej směr…" label, and a right-aligned
   * mention/attach hint). Default `true`. A host that already frames the composer
   * itself (e.g. `NewTaskDialog`, already inside a `Dialog`) passes `chrome={false}`
   * for the bare growable input, avoiding a double frame.
   */
  chrome?: boolean;
  /**
   * Suggested descriptions rendered as clickable chips below the input while it's
   * empty — clicking one submits it immediately (exactly like typing it and
   * pressing Enter), matching the velin-b command bar. Omit for no suggestions
   * (the default — a dialog host has its own affordances for this).
   */
  suggestions?: string[];
  /**
   * Show the compact classification ack row once a submit goes out (spinner +
   * "Klasifikováno jako … → spouštím …" + the quoted text + a dismiss ✕). Built
   * honestly from what CommandLine already knows at submit time — the resolved
   * `@`-mention target, the loop verdict, or (absent either) an explicit "auto"
   * label; it never fabricates a backend classification result. Default `false`:
   * a host that navigates away / unmounts on submit (e.g. `NewTaskDialog`) has no
   * use for it.
   */
  showAck?: boolean;
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
  /**
   * Send-delegation mode (Phase 38 — the chat composer): when present, a submit
   * (Enter, or the trailing action) calls this INSTEAD of launching a task via
   * `useTaskSubmit`. Renders a plain **Send** action rather than the run
   * split-button (scheduling is meaningless for a chat turn), and clears the
   * text/target/attachments itself once called — mirroring `useTaskSubmit`'s own
   * post-dispatch reset. Omit for the default task-launch behaviour (unchanged).
   */
  onSubmit?: (text: string, target?: TaskTarget, attachments?: TaskAttachmentSet) => void;
  /** Fired whenever the trimmed draft flips between empty and non-empty — lets an
   *  embedding parent (e.g. `ChatScreen`) derive a "listening" state without owning
   *  the text itself. Mirrors `ChatComposer`'s `onDraftChange` contract. */
  onDraftChange?: (hasDraft: boolean) => void;
  /**
   * A target picked OUTSIDE this component's own @mention picker — e.g. the chat
   * quick-switcher palette. Setting this inserts `@Name ` into the text and adopts
   * it exactly like an in-picker selection, then hands focus back;
   * `onInjectedTargetConsumed` fires right after so the parent can clear its
   * pending value (one-shot, mirroring the target itself).
   */
  injectedTarget?: TaskTarget;
  /** Fired once `injectedTarget` above has been applied. */
  onInjectedTargetConsumed?: () => void;
  /**
   * Show the `+`/attach affordance (and the drag-and-drop file overlay). Default
   * `true`. Chat passes `false`: the chat message API has no attachment channel
   * yet, so the affordance would silently be ignored rather than hidden.
   */
  showAttach?: boolean;
}

/** The honest, non-fabricated classification ack shown below the box after submit. */
interface AckInfo {
  text: string;
  kind: string;
  exec: string;
}

/** An in-progress `@query` the caret is currently sitting inside — `start` is the
 * index of the `@` itself, so `text.slice(start, caret)` is `@query`. */
interface Mention {
  query: string;
  start: number;
}

/** A single row of the inline mention dropdown — enough to both render the row
 * (glyph/tone by `kind`) and build the `TaskTarget` it resolves to on pick. */
interface MentionResult {
  kind: "agent" | "pipeline";
  id: string;
  name: string;
  glyph: IconName;
}

/** Matches an in-progress `@query` immediately before the caret — an `@` followed
 * by word/`.`/`-` characters, anchored at the caret (`$`). Ported verbatim from
 * the velin-b design reference's `checkMention`. */
const MENTION_QUERY_RE = /@([\w.-]*)$/;

/** Keys the mention dropdown's own keyboard nav fully owns while open — skipped
 * by the keyup re-scan below so closing (Escape) or navigating (Arrow/Enter)
 * never immediately reopens the panel from the unchanged caret position. */
const MENTION_NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Escape"]);

/** Re-derives the in-progress mention (or `null`) from the text up to the caret —
 * called on every change/click/keyup so the dropdown tracks the caret live, never
 * just the moment `@` was typed. */
function checkMention(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret);
  const match = MENTION_QUERY_RE.exec(before);
  if (!match) return null;
  return { query: (match[1] ?? "").toLowerCase(), start: caret - match[0].length };
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

/** Every `@token` occurrence in the text, verbatim (no spaces) — matches how the
 * mention picker inserts `@Name ` and how a dropped file inserts `@filename`. */
const MENTION_RE = /@\S+/g;

/** Per-type highlight tone for a detected `@token`: a known agent name resolves
 * `accent`, a known pipeline name resolves `push` (the risk-category purple), and
 * anything else (a dropped file, an unresolved name) resolves `dim`. */
function mentionRanges(
  text: string,
  agentNames: ReadonlySet<string>,
  pipelineNames: ReadonlySet<string>,
): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    if (match.index === undefined) continue;
    const token = match[0].slice(1).toLowerCase();
    const tone: HighlightTone = agentNames.has(token)
      ? "accent"
      : pipelineNames.has(token)
        ? "push"
        : "dim";
    ranges.push({ start: match.index, end: match.index + match[0].length, tone });
  }
  return ranges;
}

function noop() {
  /* no-op default for CommandLine's onClose */
}

/**
 * The unified task launcher (Phase 26; restyled to the velin-b command bar in Phase
 * 31a): one growable input that does everything — free-text description, an inline
 * `@` search to assign an agent/pipeline target, a `+`/pin button (and drag-and-drop)
 * to attach files, and a trailing split-button to run now / in 1 h / when limits
 * reset. Composed entirely from DS primitives plus the reused
 * {@link HighlightTextAreaField} (path highlights AND per-type `@token` tones), the
 * `@`-mention picker ported from `ChatComposer`, and {@link useTaskSubmit} (single
 * dispatch, or a synthesized loop when the caller passes `isLoop`/`loop` from its own
 * classify). The panel chrome (header row), suggestion chips and classification ack
 * row are opt-in via `chrome`/`suggestions`/`showAck` so the same component serves a
 * dialog-hosted bare input and a standalone command bar alike.
 */
export function CommandLine({
  rows = 1,
  maxRows = 10,
  placeholder,
  label,
  initialText,
  initialTarget,
  title = "",
  output,
  context,
  isLoop = false,
  loop = INITIAL_LOOP_STATE,
  disabled = false,
  chrome = true,
  suggestions,
  showAck = false,
  onTextChange,
  onTargetChange,
  onAttachmentsChange,
  onLaunched,
  onClose = noop,
  onSubmit,
  onDraftChange,
  injectedTarget,
  onInjectedTargetConsumed,
  showAttach = true,
}: CommandLineProps) {
  const t = useTranslations("tasks");
  const tMention = useTranslations("chat.mention");

  // Send-delegation mode (Phase 38): an `onSubmit` caller (the chat composer)
  // dispatches through it instead of `useTaskSubmit`, and gets a plain Send
  // action instead of the schedule split-button.
  const sendMode = onSubmit !== undefined;

  const [text, setText] = useState(initialText ?? "");
  const [target, setTarget] = useState<TaskTarget | undefined>(initialTarget);
  const [attachments, setAttachments] = useState<TaskAttachmentSet>({ files: [] });
  const [attachError, setAttachError] = useState<string | null>(null);
  const hasDraftRef = useRef(false);
  // Mirrors the `injectedTarget` prop so a NEW value (including the same target
  // picked again after a round-trip through `undefined` once consumed) can be
  // told apart from a re-render with the same one — ported from `ChatComposer`.
  const [prevInjectedTarget, setPrevInjectedTarget] = useState(injectedTarget);

  // The in-progress `@query` under the caret (or `null`) — drives the inline
  // dropdown directly; there is no separate "open" flag, `mention` IS the open
  // state (mirrors the velin-b reference's `mentionQ`).
  const [mention, setMention] = useState<Mention | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [ack, setAck] = useState<AckInfo | null>(null);
  // Set on a suggestion-chip click: the text state hasn't re-rendered yet at click
  // time, so the actual dispatch is deferred to the effect below, which fires once
  // `text` reflects the suggestion — the same closure staleness pitfall useTaskSubmit
  // is built to avoid.
  const pendingSuggestionRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // The mention picker never steals focus — it's inline, the textarea stays the
  // only input — so a pick only needs to move the CARET past the spliced-in
  // token once the new `text` has actually landed in the DOM (this effect fires
  // post-commit; the ref is `null` on every render that isn't a pick).
  useEffect(() => {
    if (pendingCursorRef.current === null) return;
    const el = textareaRef.current;
    if (el) el.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
    pendingCursorRef.current = null;
  }, [text]);

  /** Fires `onDraftChange` only when the trimmed draft flips between empty and
   *  non-empty — never on every keystroke (ported from `ChatComposer`). */
  function notifyDraftChange(nextText: string) {
    const hasDraft = nextText.trim().length > 0;
    if (hasDraft !== hasDraftRef.current) {
      hasDraftRef.current = hasDraft;
      onDraftChange?.(hasDraft);
    }
  }

  // Apply a target picked outside this component's own @mention picker (the chat
  // quick-switcher palette) — React's "adjust state while rendering" pattern
  // rather than a `useEffect`: it's OWN local state (`text`/`target`), so it's
  // safe to update synchronously mid-render, skipping the extra commit-then-fix-up
  // render an effect would cost. Ported from `ChatComposer`.
  if (injectedTarget !== prevInjectedTarget) {
    setPrevInjectedTarget(injectedTarget);
    if (injectedTarget) {
      const mentionText = `@${injectedTarget.name} `;
      const next =
        text.length > 0 ? `${text}${text.endsWith(" ") ? "" : " "}${mentionText}` : mentionText;
      setText(next);
      onTextChange?.(next);
      setTarget(injectedTarget);
      onTargetChange?.(injectedTarget);
    }
  }

  // The two side effects of an injection — telling the parent it's been applied
  // and handing focus back — DO belong in a real effect (an external callback + an
  // imperative DOM call, not this component's own state). Reads `text` at the
  // moment of injection rather than depending on it, so this only reruns when a
  // NEW target actually arrives.
  useEffect(() => {
    if (!injectedTarget) return;
    notifyDraftChange(text);
    onInjectedTargetConsumed?.();
    textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedTarget]);

  const selectedProject = useMemo(
    () => (activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null),
    [projects, activeProjectId],
  );
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    const all = selectedProject ? [selectedProject.path, ...detected] : detected;
    return [...new Set(all)];
  }, [text, selectedProject]);
  const pathHighlights = useMemo(() => extractPathRanges(text), [text]);

  const agentNames = useMemo(
    () => new Set(agents.map((a) => (a.name ?? a.id).toLowerCase())),
    [agents],
  );
  const pipelineNames = useMemo(
    () => new Set(pipelines.map((p) => p.name.toLowerCase())),
    [pipelines],
  );
  const mentionHighlights = useMemo(
    () => mentionRanges(text, agentNames, pipelineNames),
    [text, agentNames, pipelineNames],
  );
  const highlights = useMemo(
    () => [...pathHighlights, ...mentionHighlights],
    [pathHighlights, mentionHighlights],
  );

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

  const canRun =
    !disabled &&
    (sendMode ? text.trim().length > 0 : isLoop ? canSubmitLoop(loop) : text.trim().length > 2);
  const runLabel = isLoop ? t("loop.submit") : t("classifyRun");
  const runIcon: IconName = isLoop ? "retry" : "play";

  const ackKindLabel: Record<TaskTargetKind, string> = {
    agent: t("commandLine.ack.kind.agent"),
    pipeline: t("commandLine.ack.kind.pipeline"),
    goal: t("commandLine.ack.kind.goal"),
    chain: t("commandLine.ack.kind.chain"),
    orchestrator: t("commandLine.ack.kind.orchestrator"),
  };

  /** The honest ack built from what's already known at the moment of submit — never
   * a fabricated backend verdict (see {@link CommandLineProps.showAck}). */
  function buildAck(): AckInfo | null {
    if (!canRun || busy) return null;
    if (isLoop) {
      return {
        text,
        kind: t("commandLine.ack.kind.loop"),
        exec: title.trim() || loop.objective || t("commandLine.ack.execFallback"),
      };
    }
    if (target) return { text, kind: ackKindLabel[target.kind], exec: target.name };
    return { text, kind: t("commandLine.ack.kind.auto"), exec: t("commandLine.ack.execPending") };
  }

  /** Every submit path (Enter, the primary run action, a schedule-menu item, or a
   * suggestion chip) funnels through here so the ack row — when enabled — always
   * reflects the actual dispatch, computed at the same moment it fires.
   *
   * In send-delegation mode (`onSubmit` set) this calls the caller INSTEAD of
   * `useTaskSubmit` and clears the text/target/attachments itself — mirroring
   * `useTaskSubmit`'s own post-dispatch reset (a host that navigates away/unmounts
   * on submit has nothing further to clear; a chat thread that stays mounted does). */
  function dispatch(scheduledAt: number | null) {
    if (onSubmit) {
      if (!canRun) return;
      const trimmed = composedText.trim();
      if (!trimmed) return;
      const attachmentPayload = attachments.files.length > 0 ? attachments : undefined;
      onSubmit(trimmed, target, attachmentPayload);
      setText("");
      onTextChange?.("");
      notifyDraftChange("");
      setTarget(undefined);
      onTargetChange?.(undefined);
      if (attachmentPayload) {
        setAttachments({ files: [] });
        onAttachmentsChange?.({ files: [] });
      }
      return;
    }
    if (showAck) {
      const info = buildAck();
      if (info) setAck(info);
    }
    handleSubmit(scheduledAt);
  }

  // A suggestion chip sets `text` then flags a pending dispatch; this fires once
  // that state has landed, so `dispatch` (and the `useTaskSubmit` it calls into)
  // reads the suggestion text instead of a stale prior render's closure.
  useEffect(() => {
    if (!pendingSuggestionRef.current) return;
    pendingSuggestionRef.current = false;
    dispatch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function selectSuggestion(suggestion: string) {
    setText(suggestion);
    onTextChange?.(suggestion);
    notifyDraftChange(suggestion);
    pendingSuggestionRef.current = true;
  }

  function closeMention() {
    setMention(null);
    setMentionIndex(0);
  }

  /** Re-derives `mention` from an element's live value + caret — shared by
   *  change/click/keyup so the dropdown tracks the caret continuously, not just
   *  the instant `@` was typed (ported from the velin-b reference). */
  function syncMention(el: { value: string; selectionStart: number | null }) {
    const caret = el.selectionStart ?? el.value.length;
    setMention(checkMention(el.value, caret));
    setMentionIndex(0);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    setText(nextValue);
    onTextChange?.(nextValue);
    notifyDraftChange(nextValue);
    syncMention(e.target);
  }

  /** Caret moved via the mouse — re-check whether it's still inside an `@query`. */
  function handleMentionClick(e: MouseEvent<HTMLTextAreaElement>) {
    syncMention(e.currentTarget);
  }

  /** Caret moved via the keyboard (any key that ISN'T already fully handled by
   *  `handleKeyDown` below while the dropdown is open — see {@link MENTION_NAV_KEYS}). */
  function handleMentionKeyUp(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (MENTION_NAV_KEYS.has(e.key)) return;
    syncMention(e.currentTarget);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (mentionResults.length === 0 ? 0 : (i + 1) % mentionResults.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) =>
          mentionResults.length === 0 ? 0 : (i - 1 + mentionResults.length) % mentionResults.length,
        );
        return;
      }
      if (e.key === "Enter") {
        const active = mentionResults[activeMentionIndex];
        if (active) {
          e.preventDefault();
          pickMentionResult(active);
        }
        return;
      }
      if (e.key === "Escape") {
        // Also stop native bubbling: an enclosing Dialog closes itself on a
        // document-level Escape listener — closing just the picker must not
        // ALSO close the dialog it lives in.
        e.preventDefault();
        e.stopPropagation();
        closeMention();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispatch(null);
    }
  }

  function pickMentionResult(result: MentionResult) {
    if (!mention) return;
    const picked: TaskTarget = {
      kind: result.kind,
      id: result.id,
      name: result.name,
      glyph: result.glyph,
    };
    const mentionText = `@${picked.name} `;
    const el = textareaRef.current;
    const end = el?.selectionStart ?? mention.start + 1 + mention.query.length;
    const nextValue = text.slice(0, mention.start) + mentionText + text.slice(end);
    setText(nextValue);
    onTextChange?.(nextValue);
    notifyDraftChange(nextValue);
    setTarget(picked);
    onTargetChange?.(picked);
    pendingCursorRef.current = mention.start + mentionText.length;
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

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void uploadFiles(Array.from(e.dataTransfer.files ?? []));
  }

  function handleRemoveAttachments() {
    const next: TaskAttachmentSet = { files: [] };
    setAttachments(next);
    onAttachmentsChange?.(next);
  }

  function run(preset: SchedulePreset) {
    dispatch(resolveScheduledAt(preset, now, resetsAt));
  }

  // The inline dropdown's rows — agents then pipelines, filtered live by the
  // in-progress query, capped to a handful so the "plachta" never grows past a
  // glance (ported from the velin-b reference's `mentionResults`).
  const mentionResults = useMemo<MentionResult[]>(() => {
    if (!mention) return [];
    const agentHits: MentionResult[] = agents
      .filter((a) => matchesQuery(mention.query, a.name ?? a.id, a.id))
      .map((a) => ({
        kind: "agent" as const,
        id: a.id,
        name: a.name ?? a.id,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      }));
    const pipelineHits: MentionResult[] = pipelines
      .filter((p) => matchesQuery(mention.query, p.name, p.id))
      .map((p) => ({
        kind: "pipeline" as const,
        id: p.id,
        name: p.name,
        glyph: "flow" as IconName,
      }));
    return [...agentHits, ...pipelineHits].slice(0, 6);
  }, [mention, agents, pipelines]);
  // Clamp at read time so a result list that shrank between renders never
  // leaves the keyboard highlight out of range.
  const activeMentionIndex =
    mentionResults.length === 0 ? -1 : Math.min(mentionIndex, mentionResults.length - 1);

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

  const openFilePicker = () => fileInputRef.current?.click();

  const inputArea = (
    <Container
      data-testid={CommandLineTestId.Box}
      onDragLeave={showAttach ? handleDragLeave : undefined}
      onDragOver={showAttach ? handleDragOver : undefined}
      onDrop={showAttach ? handleDrop : undefined}
      position="relative"
    >
      {showAttach && dragOver && (
        <Container
          bottom="0"
          data-testid={CommandLineTestId.DropOverlay}
          left="0"
          pointerEvents="none"
          position="absolute"
          right="0"
          top="0"
          zIndex={20}
        >
          <Card
            bordered
            background="background"
            borderStyle="dashed"
            radius="default"
            style={{ height: "100%" }}
            tone="accent"
          >
            <Stack
              align="center"
              direction="row"
              gap="75"
              justify="center"
              style={{ height: "100%" }}
            >
              <Icon name="file" size="sm" tone="accent" />
              <Typography tone="accent" type="note">
                {t("commandLine.dropHint")}
              </Typography>
            </Stack>
          </Card>
        </Container>
      )}

      {showAttach && (
        <input
          hidden
          multiple
          data-testid={CommandLineTestId.FileInput}
          onChange={handleFileInputChange}
          ref={fileInputRef}
          type="file"
        />
      )}

      <Container position="relative">
        <HighlightTextAreaField
          autoFocus
          data-testid={CommandLineTestId.Input}
          disabled={disabled}
          highlights={highlights}
          label={label ?? t("commandLine.label")}
          onBlur={closeMention}
          onChange={handleChange}
          onClick={handleMentionClick}
          onKeyDown={handleKeyDown}
          onKeyUp={handleMentionKeyUp}
          placeholder={placeholder ?? t("commandLine.placeholder")}
          ref={textareaRef}
          rows={computeRows(text, rows, maxRows)}
          value={text}
        />

        {mention && (
          <MenuSurface
            scroll
            align="stretch"
            aria-label={tMention("ariaLabel")}
            data-testid={CommandLineTestId.MentionMenu}
            role="listbox"
          >
            {mentionResults.length === 0 ? (
              <Typography
                data-testid={CommandLineTestId.MentionEmpty}
                size="sm"
                type="note"
                variant="tertiary"
              >
                {tMention("empty")}
              </Typography>
            ) : (
              <Stack gap="0">
                {mentionResults.map((result, index) => {
                  const active = index === activeMentionIndex;
                  return (
                    <Card
                      aria-selected={active}
                      as="button"
                      background={active ? "surface" : "raised"}
                      bordered={false}
                      data-testid={`${CommandLineTestId.MentionItem}-${result.kind}-${result.id}`}
                      key={`${result.kind}-${result.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMentionResult(result);
                      }}
                      onPointerMove={() => setMentionIndex(index)}
                      radius="none"
                      role="option"
                    >
                      <CardContent padding="75">
                        <Stack align="center" direction="row" gap="75" justify="between">
                          <Tag
                            icon={result.glyph}
                            tone={result.kind === "agent" ? "accent" : "push"}
                          >
                            {result.name}
                          </Tag>
                          <Typography mono size="xs" type="note" variant="tertiary">
                            {`@${result.name}`}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </MenuSurface>
        )}
      </Container>

      <Stack align="center" direction="row" gap="75" style={{ marginTop: "8px" }}>
        {showAttach && (
          <Button
            aria-label={t("commandLine.attachAria")}
            data-testid={CommandLineTestId.Attach}
            icon="plus"
            intent="ghost"
            onClick={openFilePicker}
            size="sm"
          />
        )}

        <Stack grow style={{ minWidth: 0 }} />

        {sendMode ? (
          <Button
            data-testid={CommandLineTestId.Send}
            disabled={!canRun}
            icon="arrow"
            intent="primary"
            onClick={() => dispatch(null)}
            size="sm"
          >
            {t("commandLine.send")}
          </Button>
        ) : (
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
        )}
      </Stack>
    </Container>
  );

  const belowBox = ack ? (
    <Stack align="center" data-testid={CommandLineTestId.AckRow} direction="row" gap="150">
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
        data-testid={CommandLineTestId.AckDismiss}
        icon="x"
        intent="ghost"
        onClick={() => setAck(null)}
        size="sm"
      />
    </Stack>
  ) : (
    suggestions &&
    suggestions.length > 0 &&
    text.trim().length === 0 && (
      <Stack wrap direction="row" gap="75">
        {suggestions.map((suggestion) => (
          <Button
            data-testid={CommandLineTestId.Suggestion}
            intent="ghost"
            key={suggestion}
            onClick={() => selectSuggestion(suggestion)}
            size="sm"
          >
            {suggestion}
          </Button>
        ))}
      </Stack>
    )
  );

  return (
    <Stack data-testid={CommandLineTestId.Root} direction="col" gap="150">
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

      {chrome ? (
        <Panel
          elevated
          header={
            <>
              <Icon name="spark" size="sm" tone="accent" />
              <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
                {t("commandLine.chrome.label")}
              </Typography>
            </>
          }
          headerEnd={
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("commandLine.chrome.hint")}
            </Typography>
          }
          padding="150"
        >
          <Stack gap="150">
            {inputArea}
            {belowBox}
          </Stack>
        </Panel>
      ) : (
        <>
          {inputArea}
          {belowBox}
        </>
      )}

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
