import {
  type Approval,
  OPERATOR_QUESTION_ACTION,
  type OperatorMessage,
  type StageRunStatus,
} from "@zibby/contracts";
import type { LogStreamLine, StateTone } from "@zibby/design-system";
import { formatCostUsd } from "../../utils/cost";
import { formatDuration } from "../../utils/time";
import type { RunView } from "./run";
import { type StageRunEntry, buildPhaseNodes } from "./stagePhases";
import { groupTranscript, parseTranscript, rawLogLines } from "./transcript";

/** What the run detail screen is showing — one value drives header, actions, banners and composer. */
export type RunMode =
  | "waiting"
  | "running"
  | "pausing"
  | "paused"
  | "approval"
  | "question"
  | "parked"
  | "limit"
  | "stopped"
  | "error"
  | "done";

export function deriveRunMode(
  run: RunView,
  approval: Pick<Approval, "action"> | undefined,
): RunMode {
  switch (run.status) {
    case "scheduled":
    case "queued":
    case "pending":
      return "waiting";
    case "held":
      return approval ? "approval" : "waiting";
    case "running":
      return run.pauseRequested ? "pausing" : "running";
    case "awaiting-approval":
      return approval?.action === OPERATOR_QUESTION_ACTION ? "question" : "approval";
    case "paused":
      return "paused";
    case "parked":
      return "parked";
    case "paused-limit":
      return "limit";
    case "interrupted":
      return "stopped";
    case "error":
      return "error";
    case "done":
      return "done";
    default:
      return run.status satisfies never;
  }
}

/** The state dot/pill tone for a run mode (header pill, live view meta). */
export const MODE_TONE: Record<RunMode, StateTone> = {
  waiting: "idle",
  running: "working",
  pausing: "working",
  paused: "idle",
  approval: "blocked",
  question: "blocked",
  parked: "error",
  limit: "idle",
  stopped: "idle",
  error: "error",
  done: "done",
};

export type StageStateKey = "done" | "running" | "waiting" | "parked" | "queued" | "stopped";

/** One execution of a phase, numbered by execution order. `stageRunId` is "" for the live row. */
export interface StageRound {
  n: number;
  stageRunId: string;
  live: boolean;
}

export interface StageRailRow {
  phaseId: string;
  /** Two-digit ordinal, e.g. "01". */
  n: string;
  /** The phase id (agent runs: the processor / owner name). */
  name: string;
  state: StateTone;
  stateKey: StageStateKey;
  /** "mm:ss" | "mm:ss · ⇄02" | "—" */
  meta: string;
  /** Earlier attempts of this phase (loop retries). */
  retries: number;
  /** Every execution of this phase in order; empty for an unreached phase or an agent run. */
  rounds: StageRound[];
  current: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Milliseconds as "mm:ss" (minutes grow past 99 rather than rolling into hours). */
export function formatClock(ms: number): string {
  const sec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
}

const STAGE_TONE: Record<StageRunStatus, StateTone> = {
  done: "done",
  running: "working",
  "awaiting-approval": "blocked",
  error: "error",
  interrupted: "idle",
  "paused-limit": "idle",
};

const STAGE_KEY: Record<StageRunStatus, StageStateKey> = {
  done: "done",
  running: "running",
  "awaiting-approval": "waiting",
  error: "stopped",
  interrupted: "stopped",
  "paused-limit": "waiting",
};

/** Row state for the run's current phase when no attempt is recorded for it yet. */
function currentPlaceholder(mode: RunMode): { state: StateTone; stateKey: StageStateKey } {
  switch (mode) {
    case "running":
    case "pausing":
      return { state: "working", stateKey: "running" };
    case "approval":
    case "question":
      return { state: "blocked", stateKey: "waiting" };
    case "parked":
      return { state: "blocked", stateKey: "parked" };
    case "stopped":
    case "error":
      return { state: "idle", stateKey: "stopped" };
    default:
      return { state: "idle", stateKey: "waiting" };
  }
}

function stageMeta(
  main: StageRunEntry | null,
  live: boolean,
  liveStartedAt: string | undefined,
  now: number,
): string {
  if (main?.startedAt && main.finishedAt)
    return formatClock(Date.parse(main.finishedAt) - Date.parse(main.startedAt));
  if (live && liveStartedAt) return formatClock(now - Date.parse(liveStartedAt));
  return "—";
}

/** Agent-run row state straight from the mode (an agent run is a single stage). */
function agentRowState(mode: RunMode): { state: StateTone; stateKey: StageStateKey } {
  switch (mode) {
    case "done":
      return { state: "done", stateKey: "done" };
    case "error":
      return { state: "error", stateKey: "stopped" };
    case "waiting":
      return { state: "idle", stateKey: "queued" };
    default:
      return currentPlaceholder(mode);
  }
}

export function buildStageRail(
  run: RunView,
  mode: RunMode,
  definedPhaseIds: string[] | undefined,
  now: number,
): StageRailRow[] {
  if (run.kind === "goal") return [];
  if (run.kind !== "workflow") {
    const started = Date.parse(run.startedAt);
    const finished = run.taskOutcomeFinishedAt;
    const meta = finished
      ? formatClock(Date.parse(finished) - started)
      : mode === "running" || mode === "pausing"
        ? formatClock(now - started)
        : "—";
    return [
      {
        phaseId: run.runId,
        n: "01",
        name: run.processor?.name ?? run.owner,
        ...agentRowState(mode),
        meta,
        retries: 0,
        rounds: [],
        current: true,
      },
    ];
  }

  const live = run.status === "running";
  const nodes = buildPhaseNodes(run.stageRuns, run.currentStage, live, definedPhaseIds);
  const currentId =
    run.currentStage ?? [...nodes].reverse().find((node) => node.main)?.phaseId ?? null;
  return nodes.map((node, i) => {
    const current = node.phaseId === currentId;
    const { main } = node;
    const tone: { state: StateTone; stateKey: StageStateKey } = main
      ? { state: STAGE_TONE[main.status], stateKey: STAGE_KEY[main.status] }
      : current && run.currentStage
        ? currentPlaceholder(mode)
        : { state: "idle", stateKey: "queued" };
    if (mode === "parked" && current && main?.status === "error") tone.stateKey = "parked";
    const isLiveRow = tone.stateKey === "running";
    const time = stageMeta(main, isLiveRow, run.currentStageStartedAt, now);
    const retries = node.priorAttempts.length;
    return {
      phaseId: node.phaseId,
      n: pad2(i + 1),
      name: node.phaseId,
      ...tone,
      meta: retries > 0 ? `${time} · ⇄${pad2(retries)}` : time,
      retries,
      rounds: main
        ? [...node.priorAttempts, main].map((s, k) => ({
            n: k + 1,
            stageRunId: s.runId,
            live: s.runId === "",
          }))
        : [],
      current,
    };
  });
}

export interface RunMetric {
  key: "progress" | "elapsed" | "stage" | "retries" | "cost" | "confidence";
  value: string;
}

export function buildRunMetrics(
  run: RunView,
  rail: StageRailRow[],
  maxRetries: number | undefined,
  now: number,
): RunMetric[] {
  let progress: number;
  if (run.status === "done") progress = 100;
  else if (run.kind === "workflow")
    progress =
      rail.length === 0
        ? 0
        : Math.min(
            97,
            Math.round((rail.filter((r) => r.stateKey === "done").length / rail.length) * 100),
          );
  else progress = run.pct ?? 0;

  const end = run.taskOutcomeFinishedAt ? Date.parse(run.taskOutcomeFinishedAt) : now;
  const currentIdx = rail.findIndex((r) => r.current);
  const current = rail[currentIdx];

  return [
    { key: "progress", value: `${progress}%` },
    { key: "elapsed", value: formatDuration(end - Date.parse(run.startedAt)) },
    {
      key: "stage",
      value: rail.length > 0 ? `${pad2(currentIdx + 1 || rail.length)}/${pad2(rail.length)}` : "—",
    },
    {
      key: "retries",
      value: maxRetries != null ? `${pad2(current?.retries ?? 0)}/${pad2(maxRetries)}` : "—",
    },
    { key: "cost", value: run.costUsd != null ? formatCostUsd(run.costUsd) : "—" },
    {
      key: "confidence",
      value: run.classification ? `${Math.round(run.classification.confidence * 100)}%` : "—",
    },
  ];
}

export type MessageDelivery = "queued" | "delivered" | "undelivered";

/** An undelivered message stays QUEUED while the run is open and is NOT DELIVERED once it ends. */
export function messageDelivery(
  message: Pick<OperatorMessage, "deliveredAt">,
  terminal: boolean,
): MessageDelivery {
  if (message.deliveredAt) return "delivered";
  return terminal ? "undelivered" : "queued";
}

export type FeedItem =
  | {
      kind: "divider";
      phaseId: string;
      /** "02 REVIEWER" — the view appends the translated state and `meta`. */
      label: string;
      stateKey: StageStateKey;
      meta: string;
      state: StateTone;
    }
  | {
      kind: "agent";
      phaseId: string;
      who: string;
      markdown: string;
      tools: LogStreamLine[];
      live: boolean;
      rounds: StageRound[];
    }
  | {
      kind: "you";
      id: string;
      to: string;
      at: string;
      text: string;
      delivery: MessageDelivery;
      deliveredPhaseId?: string;
    };

const youItem = (m: OperatorMessage, terminal: boolean): FeedItem => ({
  kind: "you",
  id: m.id,
  to: m.to,
  at: m.at,
  text: m.text,
  delivery: messageDelivery(m, terminal),
  ...(m.deliveredPhaseId && { deliveredPhaseId: m.deliveredPhaseId }),
});

// `product-factory:` is the CLI's stderr prefix for a failure line (e.g. "fal 500").
const ERROR_LINE = /\b(error|rejected|blocked)\b|^product-factory:/i;

/** Markdown + tool lines of one round's log (`raw`: a tool phase, CLI output instead of a transcript). */
export function agentBody(
  phaseId: string,
  transcript: string,
  raw: boolean,
): { markdown: string; tools: LogStreamLine[] } {
  if (raw) {
    const tools = rawLogLines(transcript).map(
      (text, i): LogStreamLine => ({
        id: `${phaseId}-${i}`,
        ts: pad2(i + 1),
        text,
        ...(ERROR_LINE.test(text) && { state: "error" as const }),
      }),
    );
    return { markdown: "", tools };
  }
  const groups = groupTranscript(parseTranscript(transcript));
  const markdown = groups
    .flatMap((g) => (g.kind === "text" ? [g.markdown.trim()] : []))
    .filter(Boolean)
    .join("\n\n");
  const tools = groups
    .flatMap((g) => (g.kind === "toolCall" ? [g] : []))
    .map(
      (g, i): LogStreamLine => ({
        id: `${phaseId}-${i}`,
        // The log has no timestamps — a two-digit ordinal stands in.
        ts: pad2(i + 1),
        text: g.result ? `${g.tool} → ${g.result}` : g.tool,
      }),
    );
  return { markdown, tools };
}

function agentItem(row: StageRailRow, transcript: string, raw: boolean): FeedItem | null {
  const live = row.stateKey === "running";
  if (!transcript.trim() && !live) return null;
  return {
    kind: "agent",
    phaseId: row.phaseId,
    who: row.name,
    ...agentBody(row.phaseId, transcript, raw),
    live,
    rounds: row.rounds,
  };
}

export function buildLiveFeed(args: {
  rail: StageRailRow[];
  selectedPhaseId: string | null;
  /** Log text of the selected (default: current) stage. */
  transcript: string;
  messages: OperatorMessage[];
  terminal: boolean;
  /** Phases of workflow type `tool` — their log is raw CLI output, not an agent transcript. */
  toolPhaseIds?: ReadonlySet<string>;
}): FeedItem[] {
  const { rail, transcript, terminal, toolPhaseIds } = args;
  const selected = args.selectedPhaseId ?? rail.find((r) => r.current)?.phaseId ?? null;
  const messages = [...args.messages].sort((a, b) => a.at.localeCompare(b.at));
  const placed = new Set<string>();
  const items: FeedItem[] = [];

  for (const row of rail) {
    if (row.stateKey === "queued") continue;
    items.push({
      kind: "divider",
      phaseId: row.phaseId,
      label: `${row.n} ${row.name}`,
      stateKey: row.stateKey,
      meta: row.meta,
      state: row.state,
    });
    if (row.phaseId === selected) {
      const agent = agentItem(row, transcript, !!toolPhaseIds?.has(row.phaseId));
      if (agent) items.push(agent);
    }
    for (const m of messages) {
      if (m.deliveredAt && m.deliveredPhaseId === row.phaseId) {
        items.push(youItem(m, terminal));
        placed.add(m.id);
      }
    }
  }
  // Delivered to a phase the rail does not show, then everything still undelivered —
  // never silently dropped.
  for (const m of messages)
    if (m.deliveredAt && !placed.has(m.id)) items.push(youItem(m, terminal));
  for (const m of messages) if (!m.deliveredAt) items.push(youItem(m, terminal));
  return items;
}
