"use client";
import {
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FilePreview,
  type HighlightRange,
  HighlightTextAreaField,
  type HighlightTone,
  Icon,
  type IconName,
  MenuSurface,
  Panel,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type {
  CSSProperties,
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAgentsQuery } from "../../../agents";
import { useWorkflowsQuery } from "../../../workflows";
import { useDepartmentsQuery } from "../../../departments/queries/useDepartmentsQuery";
import { useTeamsQuery } from "../../../teams";
import { useEmployeesQuery } from "../../../employees";
import { useCompaniesQuery } from "../../../companies";
import { useProjectsQuery } from "../../../projects";
import { useSkillsQuery } from "../../../skills";
import { useUploadTaskAttachmentsMutation } from "../../mutations/useUploadTaskAttachmentsMutation";
import { type DepartmentId, type TaskTarget, extractPathRanges } from "../../task";
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
  Box = "command-line-box",
  DropOverlay = "command-line-drop-overlay",
  Suggestion = "command-line-suggestion",
  Send = "command-line-send",
  /** One compact attached-file tile — suffixed `-${file.name}` so a test can
   *  scope into a SPECIFIC file's remove button among several tiles. */
  FileTile = "command-line-file-tile",
  /** D-020 — one removable `multipleTargets` mention chip — suffixed
   *  `-${kind}-${id}` so a test can scope into a SPECIFIC chip among several. */
  MentionChip = "command-line-mention-chip",
}

/** A `#` scope source — WHAT a turn can see (a company, a team's knowledge base, a
 *  project), never WHO runs it. */
export type ScopeKind = "company" | "team" | "project";

export interface CommandLineProps {
  /** Visible rows to start at — default 1 (a single growable line). */
  rows?: number;
  /** Hard cap the auto-grow won't exceed. */
  maxRows?: number;
  placeholder?: string;
  /** Overrides the attach button's glyph — default `"plus"` (today's task
   *  launcher/automations look). A host with its own attach affordance styling
   *  (e.g. the chat dock, which uses `"paperclip"`) passes its own {@link IconName}
   *  instead; omitting this keeps every existing caller's glyph unchanged. */
  attachIcon?: IconName;
  /** Overrides the input field's visible label — default "Task"/"Zadání". Chat
   *  passes its own "Message" wording so the label reflects what's actually
   *  being composed. */
  label?: string;
  /** Hide the input's visible label while keeping its accessible name. The Velín-D
   *  chat dock's composer has no "Zpráva" caption in the design — the dock's own
   *  header already says what it is. Default `false` (every other host shows it). */
  hideLabel?: boolean;
  /**
   * Drop the input's own border/background/padding, leaving a bare growable text
   * surface — for a host whose design frames the composer itself (the chat dock's
   * glass row). Independent of {@link CommandLineProps.chrome}, which only controls
   * the outer velin-b `Panel` wrapper. Default `false`.
   */
  frameless?: boolean;
  initialText?: string;
  initialTarget?: TaskTarget;
  /** An extra guard from the caller (e.g. an incomplete "write to a file" output
   *  choice) that blocks the submit control regardless of the text guard. */
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
  /** Mirrors the live text up so an embedding parent can drive its own classify
   *  preview off the same value without owning the textarea itself. */
  onTextChange?: (text: string) => void;
  /** Mirrors the picked @-mention target (or its clearing) up to the parent. */
  onTargetChange?: (target: TaskTarget | undefined) => void;
  /**
   * `#` sources this host offers — default `[]` (no `#` picker, no `#` highlight).
   * Opt-in per host, so a composer whose submit path can't carry a scope never
   * promises one. A `#` tag answers WHAT a turn can see, never WHO runs it — it
   * never touches {@link CommandLineProps.onTargetChange}.
   */
  scopeKinds?: readonly ScopeKind[];
  /** Fires when a `#` tag of `kind` is picked (id) or removed from the text / reset
   *  (undefined). One tag per kind — picking another of the same kind replaces it. */
  onScopeChange?: (kind: ScopeKind, id: string | undefined) => void;
  /** Offer the `/` skill picker — default `false`. */
  allowSkillMentions?: boolean;
  /** Fires with the picked skill id, or `undefined` when its `/Name` leaves the text
   *  / on reset. */
  onSkillChange?: (skillId: string | undefined) => void;
  /**
   * D-020 — opt-in: the `@`-mention picker assigns SEVERAL agents/workflows/
   * departments instead of one, each rendered as its own removable chip; `target`/
   * `onTargetChange`/`initialTarget` fall out of use in this mode (a picked routing
   * unit goes onto `mentions` instead — see `onSubmit`'s 4th argument) though
   * `initialTarget` still seeds the FIRST chip (mirrors how it seeds `target`
   * otherwise). `#` scope and `/` skill tags are unaffected — they were always
   * independent of the routing target(s). Default `false` — every existing
   * single-target caller is unchanged. Only the chat dock (`CooDock`) sets this.
   */
  multipleTargets?: boolean;
  /** Mirrors the attached file set up — needed by a parent whose OWN submit path
   *  (e.g. a synthesized loop) must carry the same attachment set. */
  onAttachmentsChange?: (set: TaskAttachmentSet) => void;
  /**
   * Fired on submit (Enter, or the trailing action) with the composed text, the
   * picked `@`-mention target (if any), the attached file set (if any), and — ONLY
   * in {@link CommandLineProps.multipleTargets} mode — the full list of picked
   * mentions (`target` above stays `undefined` in that mode). This is the ONLY
   * dispatch path this component knows about — what happens after firing (launching
   * a task, sending a chat message, saving an automation) is entirely the caller's
   * concern; a container that needs task-launch semantics (scheduling, ack, loop)
   * composes {@link TaskCommandLine} instead of reaching for those here.
   */
  onSubmit: (
    text: string,
    target?: TaskTarget,
    attachments?: TaskAttachmentSet,
    mentions?: TaskTarget[],
  ) => void;
  /**
   * Whether a submit dispatch clears text/target/attachments afterwards — default
   * `true` (the chat/automations composer resets itself, ready for the next turn).
   * A container that navigates/confirms instead of staying mounted on the same draft
   * (e.g. `TaskCommandLine`, whose ack row needs the just-submitted text to survive)
   * passes `false` to keep the input intact.
   */
  resetOnSubmit?: boolean;
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
  /** Overrides the submit button label. Defaults to the send translation. */
  submitLabel?: string;
  /**
   * Extra controls rendered in the bottom-left control row, immediately after
   * the attach `+` button. This is the seam a container (e.g. `TaskCommandLine`)
   * uses to inject its own leading controls — its project selector — without
   * this component knowing what they are. Omit for no visual change (today's
   * control row, unchanged).
   */
  leadingActions?: ReactNode;
  /**
   * Overrides the bottom-right control — today the default **Send** `Button` —
   * entirely. Called with `{ canSubmit, submit }` so a container (e.g.
   * `TaskCommandLine`'s schedule split-button) can own the trailing action's
   * rendering while this component still owns validation and the actual
   * dispatch. `canSubmit` mirrors the existing `canRun` guard; `submit()` runs
   * the same submit path this component runs itself (Enter / the default
   * trailing control). Omit to keep today's default trailing control unchanged.
   */
  renderTrailing?: (api: { canSubmit: boolean; submit: () => void }) => ReactNode;
}

/** The trigger table: `@` = who runs it (agent/employee/department/workflow), `#` =
 * what it can see (company/team/project), `/` = which skill it uses. */
type Trigger = "@" | "#" | "/";

/** An in-progress `<trigger>query` the caret is currently sitting inside — `start` is
 * the index of the trigger char itself, so `text.slice(start, caret)` is `@query`. */
interface Mention {
  trigger: Trigger;
  query: string;
  start: number;
}

/** A single row of the inline mention dropdown — enough to both render the row
 * (glyph/tone by `kind`) and resolve what it picks. `color` is set only for a
 * `department` row — the mention list's rendering swaps the usual `Tag` glyph for a
 * dot tinted with the department's own brand color (Phase 91), matching
 * `WorkflowOwnerChip`'s established "colored dot" pattern. An `employee` row's `id`
 * is the employee id (testid), `agentId` is what it dispatches to. A `#` row
 * ({@link ScopeKind}) or a `skill` row resolves to NO `TaskTarget` at all — it sets
 * a scope/skill tag instead (see `pickMentionResult`). */
interface MentionRow {
  id: string;
  name: string;
  glyph: IconName;
  color?: string;
}
type MentionResult =
  | (MentionRow & { kind: "agent" | "workflow" | "department" | ScopeKind | "skill" })
  | (MentionRow & { kind: "employee"; agentId: string });

const NO_SCOPE_KINDS: readonly ScopeKind[] = [];
const SCOPE_GLYPH: Record<ScopeKind, IconName> = {
  company: "server",
  team: "brain",
  project: "code",
};

/** D-020 — mirrors the contract's `MAX_CHAT_MENTIONS` cap on `multipleTargets`. */
const MAX_MENTION_TARGETS = 8;

/** D-020 — the only kinds `multipleTargets` mode's mention picker ever produces
 *  (mirrors `ChatMentionTarget` in `@zibby/contracts`) — every member has `id`. */
type MultiMentionTarget = Extract<TaskTarget, { kind: "agent" | "workflow" | "department" }>;

/** An in-progress `<trigger>query` right before the caret. A trigger counts only at the
 * start of the text or after whitespace, so paths (`~/a/b`), emails and `a#b` never
 * open a picker. */
const MENTION_QUERY_RE = /(?:^|\s)([@#/])([\w.-]*)$/;

/** Keys the mention dropdown's own keyboard nav fully owns while open — skipped
 * by the keyup re-scan below so closing (Escape) or navigating (Arrow/Enter)
 * never immediately reopens the panel from the unchanged caret position. */
const MENTION_NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Escape"]);

/** Re-derives the in-progress mention (or `null`) from the text up to the caret —
 * called on every change/click/keyup so the dropdown tracks the caret live, never
 * just the moment the trigger was typed. Only triggers in `enabled` count. */
function checkMention(text: string, caret: number, enabled: ReadonlySet<Trigger>): Mention | null {
  const match = MENTION_QUERY_RE.exec(text.slice(0, caret));
  const trigger = match?.[1] as Trigger | undefined;
  if (!match || !trigger || !enabled.has(trigger)) return null;
  const query = match[2] ?? "";
  return { trigger, query: query.toLowerCase(), start: caret - query.length - 1 };
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

/** A name a trigger token can resolve to, with the highlight tone it renders in. */
export interface KnownName {
  trigger: Trigger;
  name: string;
  tone: HighlightTone;
}

const TRIGGER_START_RE = /(^|\s)([@#/])/g;
const NAME_CHAR_RE = /[\p{L}\p{N}_-]/u;
const TOKEN_RE = /\S*/y;

/** Every trigger token in `text` as one range. A known name matches case-insensitively,
 *  longest first, so a multi-word name ("@Coloring Book") is ONE range and wins over a
 *  shorter prefix ("@Coloring"). An unknown `@token` (a dropped file, an unresolved name)
 *  still renders `dim` up to the next whitespace; unknown `#`/`/` tokens are not marked. */
export function mentionRanges(
  text: string,
  known: readonly KnownName[],
  enabled: ReadonlySet<Trigger>,
): HighlightRange[] {
  const sorted = [...known].sort((a, b) => b.name.length - a.name.length);
  const lower = text.toLowerCase();
  const ranges: HighlightRange[] = [];
  let lastEnd = 0;
  for (const match of text.matchAll(TRIGGER_START_RE)) {
    const i = (match.index ?? 0) + (match[1]?.length ?? 0);
    const trigger = match[2] as Trigger;
    // A trigger swallowed by the previous (multi-word) range is not a new token.
    if (i < lastEnd || !enabled.has(trigger)) continue;
    const hit = sorted.find(
      (k) =>
        k.trigger === trigger &&
        lower.startsWith(k.name.toLowerCase(), i + 1) &&
        !NAME_CHAR_RE.test(text.charAt(i + 1 + k.name.length)),
    );
    if (hit) {
      ranges.push({ start: i, end: i + 1 + hit.name.length, tone: hit.tone });
    } else if (trigger === "@") {
      TOKEN_RE.lastIndex = i + 1;
      const len = TOKEN_RE.exec(text)?.[0].length ?? 0;
      if (len === 0) continue;
      ranges.push({ start: i, end: i + 1 + len, tone: "dim" });
    } else {
      continue;
    }
    lastEnd = ranges[ranges.length - 1]?.end ?? lastEnd;
  }
  return ranges;
}

/** True when a `<trigger><name>` case-insensitive match still appears in `text` — the
 * same boundary rule {@link mentionRanges} uses, reused so a picked target/tag is
 * reconciled against the SAME definition of "still referenced" (see `handleChange`). */
function hasMentionFor(text: string, trigger: Trigger, name: string): boolean {
  // A picked name may contain spaces ("Coloring Book"), so match the literal
  // `<trigger>name` followed by a non-name char rather than cutting at whitespace.
  // The trigger itself must open the text or follow whitespace (as in
  // `TRIGGER_START_RE`), so an email-like `me@Builder` never counts.
  const needle = `${trigger}${name}`.toLowerCase();
  const hay = text.toLowerCase();
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    if (i > 0 && !/\s/.test(hay.charAt(i - 1))) continue;
    if (!NAME_CHAR_RE.test(hay.charAt(i + needle.length))) return true;
  }
  return false;
}

/** A caret position in viewport coordinates — `top`/`bottom` bracket the caret's
 *  line so the mention panel can flip above or drop below it. */
interface CaretRect {
  left: number;
  top: number;
  bottom: number;
}

/** Computed-style properties copied onto the hidden mirror so its text wraps and
 *  lays out byte-identically to the textarea — the standard caret-coordinate trick. */
const CARET_MIRROR_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "wordSpacing",
  "tabSize",
] as const;

/**
 * Measure the caret's viewport rect inside a textarea via a hidden mirror div: clone
 * the text up to `selectionStart` into an off-screen element with identical typography
 * and width, drop a marker span at the caret, and read its offset. Falls back to the
 * textarea's own top-left when layout is unavailable (e.g. jsdom reports zero offsets) —
 * enough to still portal and flip the panel. Anchors to the caret LINE, so a multi-row
 * CommandLine shows the panel at the active line, not the field bottom.
 */
function measureCaretRect(ta: HTMLTextAreaElement): CaretRect {
  const rect = ta.getBoundingClientRect();
  const style = window.getComputedStyle(ta);
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const caret = ta.selectionStart ?? ta.value.length;

  const mirror = document.createElement("div");
  const mStyle = mirror.style;
  for (const prop of CARET_MIRROR_PROPS) {
    // Copy each captured typography/box property onto the mirror verbatim.
    mStyle.setProperty(prop, style.getPropertyValue(prop));
  }
  mStyle.position = "absolute";
  mStyle.visibility = "hidden";
  mStyle.whiteSpace = "pre-wrap";
  mStyle.overflowWrap = "break-word";
  mStyle.overflow = "hidden";
  mStyle.height = "auto";
  mStyle.top = "0";
  mStyle.left = "0";
  mirror.textContent = ta.value.slice(0, caret);

  const marker = document.createElement("span");
  // A non-empty marker so it still has a box at the very end of the text.
  marker.textContent = ta.value.slice(caret) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;
  document.body.removeChild(mirror);

  const top = rect.top + markerTop - ta.scrollTop;
  const left = rect.left + markerLeft - ta.scrollLeft;
  return { left, top, bottom: top + lineHeight };
}

/** How far the panel keeps from the caret, and the below-space (px) under which it
 *  flips above — mirrors {@link DropDownButton}'s spaceBelow/spaceAbove logic. */
const MENTION_GAP = 6;
const MENTION_FLIP_THRESHOLD = 240;
const MENTION_MIN_WIDTH = 240;
const MENTION_MAX_WIDTH = 320;

/** Bottom padding reserved on the textarea so the caret/text never slides under the
 *  overlaid controls, plus the inset the controls keep from the input's edges. */
const CONTROLS_RESERVED_BOTTOM = "2.75rem";
/** Same reservation, grown to also fit one wrapped row of attached-file tiles
 *  (rendered just above the controls — see the file-tile row below) so text
 *  never slides under THEM either. */
const CONTROLS_RESERVED_BOTTOM_WITH_FILES = "6.5rem";
const CONTROLS_INSET = "8px";

/**
 * The generic draft composer (Phase 26; restyled to the velin-b command bar in Phase
 * 31a; stripped of all task-launch machinery in Phase 118d): one growable input that
 * owns ONLY the draft — free-text description, an inline trigger picker (`@` assigns
 * an agent/employee/workflow/department target, `#` tags a company/team/project scope
 * when the host passes `scopeKinds`, `/` tags a skill with `allowSkillMentions`;
 * multi-word names stay ONE token), a `+`/pin button (and drag-and-drop) to attach
 * files, highlights (path + `@token` tones), and suggestion chips — firing `onSubmit`
 * on Enter or the trailing action. Composed entirely from DS primitives plus the
 * reused {@link HighlightTextAreaField} and the `@`-mention picker ported from
 * `ChatComposer`. What happens after a submit (launching a task, sending a chat
 * message, saving an automation) is the caller's concern: send-delegation consumers
 * (`ChatScreen`, the automations dialogs) pass `onSubmit` directly; the task-launch
 * container {@link TaskCommandLine} composes this component via the `leadingActions`/
 * `renderTrailing` slots instead of this component knowing about scheduling, loops,
 * or the project scope.
 */
export function CommandLine({
  rows = 1,
  maxRows = 10,
  placeholder,
  attachIcon = "plus",
  label,
  hideLabel = false,
  frameless = false,
  initialText,
  initialTarget,
  disabled = false,
  chrome = true,
  suggestions,
  onTextChange,
  onTargetChange,
  scopeKinds = NO_SCOPE_KINDS,
  onScopeChange,
  allowSkillMentions = false,
  onSkillChange,
  multipleTargets = false,
  onAttachmentsChange,
  onSubmit,
  resetOnSubmit = true,
  onDraftChange,
  injectedTarget,
  onInjectedTargetConsumed,
  showAttach = true,
  submitLabel,
  leadingActions,
  renderTrailing,
}: CommandLineProps) {
  const t = useTranslations("tasks");
  const tMention = useTranslations("chat.mention");

  // A pre-assigned `initialTarget` seeds an inline `@Name ` into the text (exactly
  // like `injectedTarget` and an in-picker pick do) so the target has a VISIBLE
  // inline representation now that the top chip is gone (Phase 59, item 2) — and so
  // the `handleChange` reconciliation (which clears a target whose `@Name` no longer
  // appears in the text) doesn't nuke it the moment the operator types.
  const [text, setText] = useState(() => {
    const base = initialText ?? "";
    if (!initialTarget) return base;
    const mention = `@${initialTarget.name} `;
    return base.length > 0 ? `${mention}${base}` : mention;
  });
  const [target, setTarget] = useState<TaskTarget | undefined>(initialTarget);
  // D-020 — `multipleTargets` mode's own state: a picked routing unit is APPENDED
  // here instead of replacing `target` above (which stays unused in this mode).
  // `initialTarget` seeds the first chip, mirroring how it seeds `target` otherwise.
  const [mentionTargets, setMentionTargets] = useState<MultiMentionTarget[]>(() =>
    multipleTargets && initialTarget && initialTarget.kind !== "orchestrator"
      ? [initialTarget as MultiMentionTarget]
      : [],
  );
  // The picked `#` scope tags (one per kind) and `/` skill — independent of
  // `target`. Each keeps its name so the same "still referenced in the text"
  // reconciliation `target` gets (see `handleChange`) applies to it too.
  const [scopeTags, setScopeTags] = useState<
    Partial<Record<ScopeKind, { id: string; name: string }>>
  >({});
  const [skill, setSkill] = useState<{ id: string; name: string } | undefined>(undefined);
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
  // The caret's viewport rect while a mention is open — drives the portaled panel's
  // fixed position (and its flip). Null when there's no open mention.
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Set on a suggestion-chip click: the text state hasn't re-rendered yet at click
  // time, so the actual submit is deferred to the effect below, which fires once
  // `text` reflects the suggestion — the same closure staleness pitfall a
  // straight-through call would hit.
  const pendingSuggestionRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCursorRef = useRef<number | null>(null);

  const { data: agents = [] } = useAgentsQuery();
  const { data: workflows = [] } = useWorkflowsQuery();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: employees = [] } = useEmployeesQuery({ status: "active" });
  // ponytail: the `#`/`/` sources fetch unconditionally (cached, cheap) — the hooks
  // take no `enabled` option; gate them if a host ever pays for it.
  const { data: teams = [] } = useTeamsQuery();
  const { data: companies = [] } = useCompaniesQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { data: skills = [] } = useSkillsQuery();

  const hasScope = scopeKinds.length > 0;
  const enabledTriggers = useMemo<ReadonlySet<Trigger>>(
    () =>
      new Set<Trigger>([
        "@",
        ...(hasScope ? (["#"] as const) : []),
        ...(allowSkillMentions ? (["/"] as const) : []),
      ]),
    [hasScope, allowSkillMentions],
  );
  const scopeSources = useMemo<Record<ScopeKind, { id: string; name: string }[]>>(
    () => ({ company: companies, team: teams, project: projects }),
    [companies, teams, projects],
  );

  const upload = useUploadTaskAttachmentsMutation();

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

  // Keep the portaled panel glued to the caret while it's open: the initial position
  // is measured synchronously as the caret moves (see `syncMention`); this effect only
  // SUBSCRIBES to scroll/resize, re-measuring in the callback — mirroring
  // DropDownButton's fixed-menu reposition (no synchronous setState in the effect body).
  useEffect(() => {
    if (!mention) return;
    const reposition = () => {
      const el = textareaRef.current;
      if (el) setCaretRect(measureCaretRect(el));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [mention]);

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

  const pathHighlights = useMemo(() => extractPathRanges(text), [text]);

  const knownNames = useMemo<KnownName[]>(() => {
    const at = (name: string, tone: HighlightTone): KnownName => ({ trigger: "@", name, tone });
    return [
      ...agents.map((a) => at(a.name ?? a.id, "accent")),
      ...employees.map((e) => at(e.name, "accent")),
      ...departments.map((d) => at(d.name, "accent")),
      ...workflows.map((w) => at(w.name, "push")),
      ...scopeKinds.flatMap((kind) =>
        scopeSources[kind].map((s): KnownName => ({ trigger: "#", name: s.name, tone: "push" })),
      ),
      ...(allowSkillMentions
        ? skills.map((s): KnownName => ({ trigger: "/", name: s.name, tone: "accent" }))
        : []),
    ];
  }, [
    agents,
    employees,
    departments,
    workflows,
    scopeKinds,
    scopeSources,
    allowSkillMentions,
    skills,
  ]);
  const mentionHighlights = useMemo(
    () => mentionRanges(text, knownNames, enabledTriggers),
    [text, knownNames, enabledTriggers],
  );
  const highlights = useMemo(
    () => [...pathHighlights, ...mentionHighlights],
    [pathHighlights, mentionHighlights],
  );

  // The send-delegation guard — the only one left now that task-launch (loop /
  // 2-char classify minimum) moved to `TaskCommandLine`.
  const canRun = !disabled && text.trim().length > 0;

  /** The only dispatch path this component owns: guard, trim, fire `onSubmit`, then
   * reset the draft unless the caller opted out via `resetOnSubmit={false}`. Every
   * submit trigger (Enter, the default Send button, a container's own
   * `renderTrailing` control, or a suggestion chip) funnels through here. */
  function submit() {
    if (!canRun) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const attachmentPayload = attachments.files.length > 0 ? attachments : undefined;
    if (multipleTargets) {
      onSubmit(
        trimmed,
        undefined,
        attachmentPayload,
        mentionTargets.length > 0 ? mentionTargets : undefined,
      );
    } else {
      onSubmit(trimmed, target, attachmentPayload);
    }
    if (resetOnSubmit) {
      setText("");
      onTextChange?.("");
      notifyDraftChange("");
      if (multipleTargets) {
        setMentionTargets([]);
      } else {
        setTarget(undefined);
        onTargetChange?.(undefined);
      }
      for (const kind of Object.keys(scopeTags) as ScopeKind[]) onScopeChange?.(kind, undefined);
      setScopeTags({});
      if (skill) {
        setSkill(undefined);
        onSkillChange?.(undefined);
      }
      if (attachmentPayload) {
        setAttachments({ files: [] });
        onAttachmentsChange?.({ files: [] });
      }
    }
  }

  // A suggestion chip sets `text` then flags a pending submit; this fires once
  // that state has landed, so `submit` reads the suggestion text instead of a
  // stale prior render's closure.
  useEffect(() => {
    if (!pendingSuggestionRef.current) return;
    pendingSuggestionRef.current = false;
    submit();
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
    setCaretRect(null);
  }

  /** Re-derives `mention` from the textarea's live value + caret — shared by
   *  change/click/keyup so the dropdown tracks the caret continuously, not just
   *  the instant `@` was typed (ported from the velin-b reference). Measures the
   *  caret rect synchronously off the live element so the portaled panel anchors to
   *  the active caret line, flipping above when there's no room below. */
  function syncMention(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const next = checkMention(el.value, caret, enabledTriggers);
    setMention(next);
    setMentionIndex(0);
    setCaretRect(next ? measureCaretRect(el) : null);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    setText(nextValue);
    onTextChange?.(nextValue);
    notifyDraftChange(nextValue);
    // The top target chip is gone (Phase 59) — the picked `@Name` inline IS the
    // only trace of `target`, so editing it out of the text is now the only way
    // to clear it. Reconcile on every change rather than sticking with a stale
    // target once its mention is deleted.
    if (multipleTargets) {
      setMentionTargets((prev) => prev.filter((t) => hasMentionFor(nextValue, "@", t.name)));
    } else {
      // A known `@Name` TYPED in full (not picked) resolves the target too — the
      // longest matching name wins. It is adopted only with no surviving target, or
      // as a longer extension of it ("@Coloring" → "@Coloring Book"), so a picked
      // target is never swapped for an unrelated typed name.
      const kept = target && hasMentionFor(nextValue, "@", target.name) ? target : undefined;
      const typed = atCandidates
        .flat()
        .filter((r) => hasMentionFor(nextValue, "@", r.name))
        .reduce<MentionResult | undefined>(
          (best, r) => (!best || r.name.length > best.name.length ? r : best),
          undefined,
        );
      const adopt =
        typed &&
        (!kept ||
          (typed.name.length > kept.name.length &&
            typed.name.toLowerCase().startsWith(kept.name.toLowerCase())))
          ? toPickedTarget(typed)
          : kept;
      if (adopt !== target) {
        setTarget(adopt);
        onTargetChange?.(adopt);
      }
    }
    // `#` scope tags and the `/` skill reconcile the SAME way — their token deleted
    // out of the text clears them, independent of whatever happens to `target`.
    const goneScopes = (Object.keys(scopeTags) as ScopeKind[]).filter(
      (kind) => !hasMentionFor(nextValue, "#", scopeTags[kind]?.name ?? ""),
    );
    if (goneScopes.length > 0) {
      setScopeTags((prev) => {
        const next = { ...prev };
        for (const kind of goneScopes) delete next[kind];
        return next;
      });
      for (const kind of goneScopes) onScopeChange?.(kind, undefined);
    }
    if (skill && !hasMentionFor(nextValue, "/", skill.name)) {
      setSkill(undefined);
      onSkillChange?.(undefined);
    }
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
          return;
        }
        // Zero results — nothing to pick: close the empty panel, then Enter falls
        // through to the submit below (keyup skips Enter, so nothing else would close it).
        closeMention();
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
      submit();
    }
  }

  /** An `@` row → its `TaskTarget` (shared by a picked row and a typed `@Name`).
   *  A per-kind switch (not a generic `{ kind: result.kind, ... }` object) so each
   *  branch's literal `kind` matches `TaskTarget`'s properly-distributed union —
   *  see `toApiTarget`'s doc comment in `task.ts` for why a unioned-kind
   *  construction stops being assignable once there are enough branches. A
   *  department row's `id` is cast to `DepartmentId`: `MentionResult.id` is a plain
   *  `string` (shared with agent/workflow rows), but for a `kind: "department"` row
   *  it always came from `useDepartmentsQuery()`'s own `DepartmentId`-typed id. */
  function toPickedTarget(result: MentionResult): TaskTarget {
    return result.kind === "agent"
      ? { kind: "agent", id: result.id, name: result.name, glyph: result.glyph }
      : result.kind === "employee"
        ? // An employee holds a position — it dispatches to that position's agent.
          { kind: "agent", id: result.agentId, name: result.name, glyph: "bot" }
        : result.kind === "workflow"
          ? { kind: "workflow", id: result.id, name: result.name, glyph: result.glyph }
          : {
              kind: "department",
              id: result.id as DepartmentId,
              name: result.name,
              glyph: result.glyph,
            };
  }

  function pickMentionResult(result: MentionResult) {
    if (!mention) return;
    const mentionText = `${mention.trigger}${result.name} `;
    const el = textareaRef.current;
    const end = el?.selectionStart ?? mention.start + 1 + mention.query.length;
    const nextValue = text.slice(0, mention.start) + mentionText + text.slice(end);
    setText(nextValue);
    onTextChange?.(nextValue);
    notifyDraftChange(nextValue);

    if (result.kind === "company" || result.kind === "team" || result.kind === "project") {
      // A `#` tag answers WHAT scope a turn can see, never WHO runs it — this
      // branches BEFORE building a `TaskTarget` so it never touches `target`.
      const kind = result.kind;
      setScopeTags((prev) => ({ ...prev, [kind]: { id: result.id, name: result.name } }));
      onScopeChange?.(kind, result.id);
    } else if (result.kind === "skill") {
      setSkill({ id: result.id, name: result.name });
      onSkillChange?.(result.id);
    } else {
      const picked = toPickedTarget(result);
      if (multipleTargets) {
        // D-020 — append (deduplicated by kind+id), up to the contract's cap of 8.
        // `picked` is always agent/workflow/department in this branch (the switch
        // above never produces anything else) — see `MultiMentionTarget`.
        const asMulti = picked as MultiMentionTarget;
        setMentionTargets((prev) => {
          if (prev.some((t) => t.kind === asMulti.kind && t.id === asMulti.id)) return prev;
          if (prev.length >= MAX_MENTION_TARGETS) return prev;
          return [...prev, asMulti];
        });
      } else {
        setTarget(picked);
        onTargetChange?.(picked);
      }
    }

    pendingCursorRef.current = mention.start + mentionText.length;
    closeMention();
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

  /** Removes ONE attached file by name — each compact tile owns its own remove
   *  button now (Phase 59), rather than the old single control that cleared the
   *  whole set. Dropping the last file also drops the now-meaningless
   *  `attachmentSetId`, mirroring the prior "clear all" behaviour. */
  function handleRemoveFile(name: string) {
    const files = attachments.files.filter((f) => f.name !== name);
    const next: TaskAttachmentSet = files.length > 0 ? { ...attachments, files } : { files: [] };
    setAttachments(next);
    onAttachmentsChange?.(next);
  }

  /** D-020 — removes ONE `multipleTargets` mention chip: drops it from the picked
   *  list AND strips its `@Name` token out of the text, so the two stay in sync
   *  (rather than leaving a now-unbacked `@Name` behind for the reconciliation in
   *  `handleChange` to silently re-drop on the next keystroke). */
  function removeMentionTarget(removed: MultiMentionTarget) {
    setMentionTargets((prev) =>
      prev.filter((t) => !(t.kind === removed.kind && t.id === removed.id)),
    );
    const needle = removed.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = text.replace(new RegExp(`@${needle}\\s?`, "i"), "");
    setText(next);
    onTextChange?.(next);
    notifyDraftChange(next);
  }

  // The inline dropdown's rows — agents then workflows, filtered live by the
  // in-progress query. Capped only as a runaway guard (50) — a real catalog
  // easily exceeds the old 6-row cap, and MenuSurface's own `scroll` +
  // `maxHeight` clamp (see `mentionMenuStyle`) is what keeps the panel itself
  // from growing past the viewport, so the list is scrollable rather than cut
  // off (ported from the velin-b reference's `mentionResults`).
  // Phase 91: only departments with at least one owned workflow are dispatchable —
  // a capability-less department would only ever hit the 0-owned validation reject,
  // so it stays out of the picker entirely (mirrors an empty agent/workflow catalog
  // never appearing either).
  const rosterDepartmentIds = useMemo(
    () => new Set(workflows.flatMap((p) => (p.department ? [p.department] : []))),
    [workflows],
  );
  const rosterDepartments = useMemo(
    () => departments.filter((s) => rosterDepartmentIds.has(s.id)),
    [departments, rosterDepartmentIds],
  );

  // Every `@` row, unfiltered and grouped per kind in display order — the picker
  // filters it by the in-progress query, `handleChange` resolves a typed `@Name` in it.
  const atCandidates = useMemo<MentionResult[][]>(() => {
    const employeeRows: MentionResult[] = employees.map((e) => ({
      kind: "employee" as const,
      id: e.id,
      name: e.name,
      glyph: "bot" as IconName,
      agentId: e.agentId,
    }));
    const departmentRows: MentionResult[] = rosterDepartments.map((s) => ({
      kind: "department" as const,
      id: s.id,
      name: s.name,
      glyph: "grid" as IconName,
      color: s.color,
    }));
    const workflowRows: MentionResult[] = workflows.map((p) => ({
      kind: "workflow" as const,
      id: p.id,
      name: p.name,
      glyph: "flow" as IconName,
    }));
    // An agent an active employee holds is already reachable through that employee.
    const held = new Set(employees.map((e) => e.agentId));
    const freeAgentRows: MentionResult[] = agents
      .filter((a) => !held.has(a.id))
      .map((a) => ({
        kind: "agent" as const,
        id: a.id,
        name: a.name ?? a.id,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      }));
    return [employeeRows, departmentRows, workflowRows, freeAgentRows];
  }, [agents, employees, workflows, rosterDepartments]);

  const mentionResults = useMemo<MentionResult[]>(() => {
    if (!mention) return [];
    const q = mention.query;
    // An empty query caps EACH kind so a big catalog of one kind never crowds the
    // others out of the overall 50-row list; a typed query narrows enough already.
    const perKind = q ? 50 : 12;
    if (mention.trigger === "#") {
      return scopeKinds
        .flatMap((kind) =>
          scopeSources[kind]
            .filter((src) => matchesQuery(q, src.name, src.id))
            .slice(0, perKind)
            .map((src) => ({ kind, id: src.id, name: src.name, glyph: SCOPE_GLYPH[kind] })),
        )
        .slice(0, 50);
    }
    if (mention.trigger === "/") {
      return skills
        .filter((sk) => matchesQuery(q, sk.name, sk.id))
        .map((sk) => ({ kind: "skill" as const, id: sk.id, name: sk.name, glyph: sk.glyph }))
        .slice(0, 50);
    }
    return atCandidates
      .flatMap((rows) => rows.filter((r) => matchesQuery(q, r.name, r.id)).slice(0, perKind))
      .slice(0, 50);
  }, [mention, atCandidates, scopeKinds, scopeSources, skills]);
  // Clamp at read time so a result list that shrank between renders never
  // leaves the keyboard highlight out of range.
  const activeMentionIndex =
    mentionResults.length === 0 ? -1 : Math.min(mentionIndex, mentionResults.length - 1);

  // The fixed position for the portaled mention panel, anchored to the caret rect.
  // Flips above the caret when there isn't room below (chat's bottom-of-page composer)
  // and clamps its height to the available space — mirroring DropDownButton's logic.
  const mentionMenuStyle: CSSProperties | undefined = useMemo(() => {
    if (!caretRect) return undefined;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 0;
    const spaceBelow = viewportH - caretRect.bottom - MENTION_GAP;
    const spaceAbove = caretRect.top - MENTION_GAP;
    const flip = spaceBelow < MENTION_FLIP_THRESHOLD && spaceAbove > spaceBelow;
    const available = Math.max(flip ? spaceAbove : spaceBelow, 0);
    const maxHeight = Math.min(Math.max(available, 120), viewportH * 0.6);
    const left = Math.max(
      MENTION_GAP,
      Math.min(caretRect.left, viewportW - MENTION_MAX_WIDTH - MENTION_GAP),
    );
    const horizontal: CSSProperties = {
      left,
      minWidth: MENTION_MIN_WIDTH,
      maxWidth: MENTION_MAX_WIDTH,
    };
    return flip
      ? { bottom: viewportH - caretRect.top + MENTION_GAP, ...horizontal, maxHeight }
      : { top: caretRect.bottom + MENTION_GAP, ...horizontal, maxHeight };
  }, [caretRect]);

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
          frameless={frameless}
          hideLabel={hideLabel}
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
          // Reserve a bottom strip so the caret/text never slides under the overlaid
          // controls — grown when files are attached to also clear their tile row
          // (a DS style passthrough for the genuinely-layout value).
          style={{
            paddingBottom:
              attachments.files.length > 0
                ? CONTROLS_RESERVED_BOTTOM_WITH_FILES
                : CONTROLS_RESERVED_BOTTOM,
          }}
          value={text}
        />

        {/* Attached files — a wrapping row of compact tiles sitting INSIDE the input,
            just above the attach button (never the old full-width stack below the box). */}
        {attachments.files.length > 0 && (
          <Container
            bottom={CONTROLS_RESERVED_BOTTOM}
            left={CONTROLS_INSET}
            position="absolute"
            right={CONTROLS_INSET}
            zIndex={10}
          >
            <Stack wrap direction="row" gap="50">
              {attachments.files.map((file) => (
                <Container
                  data-testid={`${CommandLineTestId.FileTile}-${file.name}`}
                  key={file.name}
                  maxWidth="12rem"
                >
                  <FilePreview
                    mediaType={file.mediaType}
                    name={file.name}
                    onRemove={() => handleRemoveFile(file.name)}
                    size={file.size}
                  />
                </Container>
              ))}
            </Stack>
          </Container>
        )}

        {/* Attach + `leadingActions` — pinned bottom-left INSIDE the input, over the
            reserved strip. `TaskCommandLine` injects its own project selector here
            (Phase 118d) — this component no longer knows what a "project" is. */}
        <Container bottom={CONTROLS_INSET} left={CONTROLS_INSET} position="absolute" zIndex={10}>
          <Stack align="center" direction="row" gap="50">
            {showAttach && (
              <Button
                aria-label={t("commandLine.attachAria")}
                data-testid={CommandLineTestId.Attach}
                icon={attachIcon}
                intent="ghost"
                onClick={openFilePicker}
                size="sm"
              />
            )}
            {leadingActions}
          </Stack>
        </Container>

        {/* Send — pinned bottom-right INSIDE the input, over the reserved strip. */}
        <Container bottom={CONTROLS_INSET} position="absolute" right={CONTROLS_INSET} zIndex={10}>
          {renderTrailing ? (
            renderTrailing({ canSubmit: canRun, submit })
          ) : (
            <Button
              data-testid={CommandLineTestId.Send}
              disabled={!canRun}
              icon="arrow"
              intent="primary"
              onClick={submit}
              size="sm"
            >
              {submitLabel ?? t("commandLine.send")}
            </Button>
          )}
        </Container>
      </Container>

      {/* The mention panel is portaled to body (escaping the wrapper's overflow/z clip)
          and positioned `fixed` at the caret rect, flipping above when needed. */}
      {mention &&
        typeof document !== "undefined" &&
        createPortal(
          <MenuSurface
            scroll
            aria-label={tMention("ariaLabel")}
            data-testid={CommandLineTestId.MentionMenu}
            placement="fixed"
            role="listbox"
            style={mentionMenuStyle}
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
                          {result.kind === "department" ? (
                            <Stack inline align="center" direction="row" gap="50">
                              <Container
                                data-testid={`${CommandLineTestId.MentionItem}-${result.kind}-${result.id}-dot`}
                                height="8px"
                                shrink={false}
                                style={{ borderRadius: "50%", background: result.color }}
                                width="8px"
                              />
                              <Typography size="sm" type="note">
                                {result.name}
                              </Typography>
                            </Stack>
                          ) : (
                            <Tag
                              icon={result.glyph}
                              tone={
                                result.kind === "agent" || result.kind === "employee"
                                  ? "accent"
                                  : result.kind === "workflow"
                                    ? "push"
                                    : result.kind === "skill"
                                      ? "neutral"
                                      : // a `#` scope row — WHAT a turn sees, not WHO runs it
                                        "send"
                              }
                            >
                              {result.name}
                            </Tag>
                          )}
                          <Typography mono size="xs" type="note" variant="tertiary">
                            {`${mention.trigger}${result.name}`}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </MenuSurface>,
          document.body,
        )}
    </Container>
  );

  // D-020 — `multipleTargets` mode's removable chip row, one per addressed unit.
  const mentionChipsRow = multipleTargets && mentionTargets.length > 0 && (
    <Stack wrap direction="row" gap="50">
      {mentionTargets.map((t) => (
        <Chip
          closable
          closeLabel={tMention("removeAria", { name: t.name })}
          data-testid={`${CommandLineTestId.MentionChip}-${t.kind}-${t.id}`}
          key={`${t.kind}-${t.id}`}
          onClose={() => removeMentionTarget(t)}
          tone="thinking"
        >
          {t.name}
        </Chip>
      ))}
    </Stack>
  );

  const belowBox = suggestions && suggestions.length > 0 && text.trim().length === 0 && (
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
  );

  return (
    <Stack data-testid={CommandLineTestId.Root} direction="col" gap="150">
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
              {/* The hint never claims a trigger this render doesn't offer. */}
              {[
                t("commandLine.chrome.hintParts.at"),
                ...(hasScope
                  ? [
                      t("commandLine.chrome.hintParts.hash", {
                        kinds: scopeKinds
                          .map((k) => t(`commandLine.chrome.scopeKind.${k}`))
                          .join(", "),
                      }),
                    ]
                  : []),
                ...(allowSkillMentions ? [t("commandLine.chrome.hintParts.slash")] : []),
                t("commandLine.chrome.hintParts.files"),
              ].join(" · ")}
            </Typography>
          }
          padding="150"
        >
          <Stack gap="150">
            {mentionChipsRow}
            {inputArea}
            {belowBox}
          </Stack>
        </Panel>
      ) : (
        <>
          {mentionChipsRow}
          {inputArea}
          {belowBox}
        </>
      )}

      {(upload.isPending || attachError) && (
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
        </Stack>
      )}
    </Stack>
  );
}
