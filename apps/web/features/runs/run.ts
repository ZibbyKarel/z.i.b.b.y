import type { Approval, RunKind, TaskRun, TaskRunStatus } from "@zibby/contracts";
import type { DotTone, IconName, StateTone, TagTone } from "@zibby/design-system";

/**
 * The Runs screen is a task feed: what the user asked for is the headline, the
 * agent/pipeline/goal that processes it is metadata (`processor`). The merge that
 * used to live here (the per-kind run lists + still-waiting scheduled tasks, with a
 * goal's child runs folded out) now runs server-side — this file is types + the
 * pure presentation helpers the feed/detail render with.
 *
 * `RunView` is the web alias of the contract's {@link TaskRun}: a single import-swap
 * so every consumer that reads `run.kind`/`run.owner`/`run.status`/… keeps working,
 * and the "X is processing it" label reads `run.processor`.
 */
export type RunView = TaskRun;

/** Re-exported from the contract so existing `from "../run"` imports keep resolving. */
export type { RunKind };

/** Feed status: the shared run states plus the not-yet-fired `scheduled`, the
 * retries-parked `parked` (approval-parked pipelines keep reading as
 * `awaiting-approval` — that mapping is load-bearing for the approvals gate), and
 * Phase 8's pre-dispatch budget holds `held` (over a cap, behind an approval) and
 * `queued` (waiting for a concurrency slot). Aliased to the contract's `TaskRunStatus`. */
export type FeedStatus = TaskRunStatus;

/**
 * The feed row a selection (`?run=<id>`) points at, falling back to the first row of
 * the (already filtered) list. Matches `runId` OR `taskId` so a selection survives the
 * feed identity shift when a `pending` task (keyed by its task id) flips to its
 * dispatched run (keyed by the run ref): the New Task dialog redirects with the task
 * id, and both the pending card (`runId === taskId`) and the later run (`taskId` set)
 * match it. Returns null when the list is empty.
 */
export function findSelectedRun(list: readonly RunView[], selId: string | null): RunView | null {
  return (
    list.find((r) => r.runId === selId || (selId != null && r.taskId === selId)) ??
    list[0] ??
    null
  );
}

/**
 * Kinds whose run owns a single live process the backend can actually kill (Phase
 * 43 — `stopTaskRun` generalized past agent-only). A chain run orchestrates a
 * sequence of pipeline runs with no process of its own, and a `scheduled` row has
 * no run behind it yet — neither has anything to interrupt.
 */
const STOPPABLE_KINDS = new Set<RunKind>(["agent", "pipeline", "goal"]);

/** Whether the Stop action applies to `run` at all — a stoppable kind, currently running. */
export function isStoppableRun(run: Pick<RunView, "kind" | "status">): boolean {
  return run.status === "running" && STOPPABLE_KINDS.has(run.kind);
}

/**
 * Task-first display name: the explicit task title, else (for runs born from a
 * task) the task's own name, else the run's prompt, else the routed target id.
 * A pipeline run's `prompt` is the "fáze: X" progress string — a subtitle, never
 * a headline — so a pipeline falls straight to its pipeline id when it has no
 * task name, rather than showing the current phase where the task name belongs.
 */
export function runTitle(run: RunView): string {
  if (run.kind === "pipeline") return run.title || run.taskTitle || run.owner;
  return run.title || run.taskTitle || run.prompt || run.owner;
}

/** Extensions that are clearly NOT markdown — everything else defaults to markdown
 * (a produced text artifact is normally a markdown doc; Phase 41). */
const NON_MARKDOWN_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "yml",
  "yaml",
  "css",
  "html",
  "py",
  "sh",
  "go",
  "rs",
  "java",
  "rb",
  "php",
  "sql",
  "xml",
  "toml",
  "txt",
  "csv",
  "log",
]);

/**
 * Whether a produced file artifact should render as formatted markdown rather than a
 * plain code block — `.md`/`.markdown`, or a name with no recognized extension (the
 * common shape for a written artifact). A clearly non-markdown code/text file (`.ts`,
 * `.json`, `.txt`, …) keeps the existing `CodeBlock`.
 */
export function isMarkdownFilename(name: string | undefined): boolean {
  if (!name) return true;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return true;
  const ext = name.slice(dot + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return true;
  return !NON_MARKDOWN_EXTENSIONS.has(ext);
}

/**
 * The pending approval that belongs to a run waiting on the gate. Agent runs
 * match exactly; a pipeline run's approval is keyed by the STAGE run id
 * (`${pipelineRunId}.${phaseId}_…`), so pipeline rows match on the prefix.
 * A Phase-8 budget-`held` task names its spend-past-cap override approval directly
 * (`approvalId`), so the held task's detail can surface — and decide — the same
 * override that lives in the approvals queue, rather than the operator hunting for it.
 * Generic so the enriched `DashboardApproval` view flows through unchanged.
 */
export function approvalForRun<A extends Pick<Approval, "id" | "runId">>(
  queue: readonly A[],
  run: Pick<RunView, "runId" | "kind" | "status" | "approvalId">,
): A | undefined {
  // A held dispatch points at its override approval by id (it is not "awaiting-approval"
  // — it hasn't run yet — but the gate decision is the same one queued elsewhere).
  if (run.status === "held") {
    return run.approvalId ? queue.find((a) => a.id === run.approvalId) : undefined;
  }
  if (run.status !== "awaiting-approval") return undefined;
  return queue.find(
    (a) =>
      a.runId === run.runId || (run.kind === "pipeline" && a.runId.startsWith(`${run.runId}.`)),
  );
}

export interface RunStateMeta {
  /** i18n key suffix under `runs.state.*`. */
  key: FeedStatus;
  badge: TagTone;
  dot: DotTone;
  glyph: IconName;
  pulse: boolean;
}

export const RUN_STATE: Record<FeedStatus, RunStateMeta> = {
  scheduled: {
    key: "scheduled",
    badge: "neutral",
    dot: "idle",
    glyph: "clock",
    pulse: false,
  },
  // Accepted; its run is spawning in the background. Reads as live (pulses) — it
  // flips to `running` in place the moment the run starts.
  pending: {
    key: "pending",
    badge: "neutral",
    dot: "run",
    glyph: "pulse",
    pulse: true,
  },
  running: {
    key: "running",
    badge: "run",
    dot: "run",
    glyph: "run",
    pulse: true,
  },
  "awaiting-approval": {
    key: "awaiting-approval",
    badge: "warn",
    dot: "wait",
    glyph: "wait",
    pulse: true,
  },
  done: { key: "done", badge: "ok", dot: "ok", glyph: "ok", pulse: false },
  error: {
    key: "error",
    badge: "bad",
    dot: "bad",
    glyph: "warn",
    pulse: false,
  },
  interrupted: {
    key: "interrupted",
    badge: "neutral",
    dot: "idle",
    glyph: "stop",
    pulse: false,
  },
  parked: {
    key: "parked",
    badge: "warn",
    dot: "wait",
    glyph: "wait",
    pulse: false,
  },
  "paused-limit": {
    key: "paused-limit",
    badge: "neutral",
    dot: "wait",
    glyph: "pause",
    pulse: false,
  },
  held: {
    key: "held",
    badge: "warn",
    dot: "wait",
    glyph: "pause",
    pulse: false,
  },
  queued: {
    key: "queued",
    badge: "neutral",
    dot: "idle",
    glyph: "clock",
    pulse: false,
  },
};

/**
 * `RUN_STATE.badge`'s `TagTone` narrowed to the canonical {@link StateTone}
 * vocabulary — `undefined` for `neutral` (and the risk-kind tones, unreachable
 * here). One source, two readers: the state chip's `Tag` tone stays a `TagTone`
 * (it also needs `neutral`), while a card's left `edge` bar / progress fill /
 * header glow all read this narrower tone so "what color is this state" is
 * decided exactly once.
 */
const BADGE_TO_STATE_TONE: Partial<Record<TagTone, StateTone>> = {
  accent: "accent",
  ok: "ok",
  warn: "warn",
  bad: "bad",
  run: "run",
};

/**
 * A run status's state-tone, or `undefined` for a neutral (non-live,
 * non-terminal-outcome) status like `scheduled`/`queued`/`interrupted` — those
 * read as matte with no accent color, per "color = state" (a status with no
 * strong state doesn't borrow one).
 */
export function runStateTone(status: FeedStatus): StateTone | undefined {
  return BADGE_TO_STATE_TONE[RUN_STATE[status].badge];
}

const KIND_GLYPH: Record<RunKind, IconName> = {
  agent: "bot",
  pipeline: "flow",
  goal: "retry",
  chain: "link",
  scheduled: "clock",
};

/** Resolve a run's display glyph from the catalog (agent), else by kind. */
export function runGlyph(run: RunView, glyphById: Map<string, IconName>): IconName {
  return glyphById.get(run.owner) ?? KIND_GLYPH[run.kind];
}

/**
 * Resolve a run's assigned-entity avatar (agent/pipeline) from the catalog, keyed by
 * `run.owner`. Returns `undefined` when the owner has no avatar — the run-detail
 * header then falls back to the {@link runGlyph} glyph (Phase 48).
 */
export function runAvatar(run: RunView, avatarById: Map<string, string>): string | undefined {
  return avatarById.get(run.owner);
}
