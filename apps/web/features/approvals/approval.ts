import type { Approval as ContractApproval, ScheduledTask } from "@zibby/contracts";
import type { IconName, LegacyStateTone, TagTone } from "@zibby/design-system";

/**
 * The design models an approval much richer than the contract does: the contract
 * `Approval` is flat (`action` + a free `detail` string + `risk` = low/med/high),
 * while the design needs a semantic risk *type* (platba/mazání/push/odeslání), a
 * separate severity meter, and a structured preview of the exact action.
 *
 * Since the contract may not change, the runner (and the seed) packs those extra
 * fields as JSON inside the free-string `detail`, and the contract `risk` carries
 * the *severity*. {@link parseApprovalDetail} unpacks it and **degrades to plain
 * text** when `detail` is a normal string — so this screen still works verbatim
 * against a real backend that sends an unenriched approval.
 */

/** Canonical, never-renamed semantic risk types (the approval gate taxonomy). */
export type RiskType = "platba" | "mazani" | "push" | "odeslani";

/**
 * Risk types that require the deliberate **hold-to-confirm** guardrail rather than a
 * single click — payment and deletion (mirrors `ApprovalCard`'s `highRisk` set, which
 * maps these to the DS `payment`/`deletion` kinds). The canonical source so the queue
 * card and the run-detail gate agree on which approvals are high-risk.
 */
export const HIGH_RISK_TYPES: ReadonlySet<RiskType> = new Set(["platba", "mazani"]);

export type ApprovalActorKind = "skill" | "agent" | "workflow";

/** Structured preview of the exact action an agent is about to take. */
export type ApprovalPreview =
  | {
      kind: "cart";
      total: string;
      meta?: string;
      items: Array<[name: string, price: string]>;
    }
  | { kind: "diff"; file: string; meta?: string; hunks: DiffHunk[] }
  | {
      kind: "command";
      shell: string;
      cmd: string;
      note?: string;
      targets: string[];
    }
  | { kind: "message"; to: string; subject?: string; body: string };

export interface DiffHunk {
  h: string;
  lines: Array<[kind: "add" | "del" | "ctx", text: string]>;
}

/**
 * NS2 F0c — where this approval's proposal-shaped request originated. Packed
 * into the `detail` envelope (not a contract schema field — the approvals
 * feed is a single kind-agnostic inbox, not a per-kind screen); an older
 * parked record without `source` renders unchanged (no origin chip).
 */
export type ApprovalSource = "agent-factory";

/** The enrichment we (optionally) find packed into `Approval.detail`. */
export interface ApprovalEnrichment {
  riskType?: RiskType;
  actorKind?: ApprovalActorKind;
  glyph?: IconName;
  summary?: string;
  consequence?: string;
  via?: string;
  preview?: ApprovalPreview;
  source?: ApprovalSource;
}

/** A contract approval plus the parsed enrichment (or a plain-text fallback). */
export interface DashboardApproval extends ContractApproval, ApprovalEnrichment {
  /** Plain-text detail when `detail` was not enriched JSON. */
  text?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Unpack the enrichment JSON from a contract approval's `detail`. Falls back to
 * `{ text: detail }` for a plain-string detail, so the UI never breaks on a real
 * (unenriched) backend payload.
 */
export function parseApprovalDetail(a: ContractApproval): DashboardApproval {
  let data: unknown;
  try {
    data = JSON.parse(a.detail);
  } catch {
    return { ...a, text: a.detail };
  }
  if (!isRecord(data) || !("preview" in data || "riskType" in data || "summary" in data)) {
    return { ...a, text: a.detail };
  }
  const e = data as ApprovalEnrichment;
  // Overwrite `detail` with the human summary so any consumer that shows the raw
  // `detail` line (e.g. the overview ApprovalCard) reads cleanly, while this
  // screen uses the structured `preview`/`consequence` fields directly.
  return { ...a, ...e, detail: e.summary ?? a.detail };
}

/**
 * ZB-01: DS `ApprovalCard`'s `waited` prop wants a bare duration ("12m", "2h"),
 * unlike `formatRelativeTime`'s localized "3 minutes ago" (built for the retired
 * chat flyout). Deliberately locale-agnostic mono shorthand, same register as the
 * DS App mock's rail cards.
 */
export function formatWaited(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Tone usable for Card / Typography / StatusDot / Icon / Stat — the pre-ZibbyCorp
 * {@link LegacyStateTone} minus `run` (which collapses to `accent` in these
 * surfaces; those DS props stay on the legacy vocabulary until ZA-02 restyles
 * them — see `run.ts`'s `BADGE_TO_STATE_TONE`). */
export type UiTone = Exclude<LegacyStateTone, "run">;

interface RiskMeta {
  label: string;
  glyph: IconName;
  /** Badge tone (the Badge component accepts the full palette incl. `run`). */
  tone: TagTone;
  /** Tone for Card/Stat/etc. (`run` collapses to `accent`). */
  uiTone: UiTone;
  /** Color CSS variable used by the bespoke detail accents. */
  cssVar: string;
}

/** Semantic risk-type presentation. */
export const RISK_META: Record<RiskType, RiskMeta> = {
  platba: {
    label: "platba",
    glyph: "cart",
    tone: "warn",
    uiTone: "warn",
    cssVar: "var(--color-warn)",
  },
  mazani: {
    label: "mazání",
    glyph: "trash",
    tone: "bad",
    uiTone: "bad",
    cssVar: "var(--color-bad)",
  },
  push: {
    label: "push",
    glyph: "branch",
    tone: "accent",
    uiTone: "accent",
    cssVar: "var(--color-accent)",
  },
  odeslani: {
    label: "odeslání",
    glyph: "arrow",
    tone: "run",
    uiTone: "accent",
    cssVar: "var(--color-work)",
  },
};

export function riskMeta(type: RiskType | undefined): RiskMeta {
  return (type && RISK_META[type]) || RISK_META.platba;
}

/** Severity (contract `risk`) → meter segments + tone. */
export const SEVERITY: Record<
  ContractApproval["risk"],
  { segments: number; tone: UiTone; cssVar: string; label: string }
> = {
  low: { segments: 1, tone: "ok", cssVar: "var(--color-ok)", label: "nízká" },
  medium: {
    segments: 2,
    tone: "warn",
    cssVar: "var(--color-warn)",
    label: "střední",
  },
  high: {
    segments: 3,
    tone: "bad",
    cssVar: "var(--color-bad)",
    label: "vysoká",
  },
};

/** What raised an approval — always shown on the sheet (`policy.approvals.sheet.origin.*`). */
export type ApprovalOrigin =
  | "operator"
  | "department"
  | "channel"
  | "automation"
  | "roadmap"
  | "workflow"
  | "agent"
  | "pr-review"
  | "agent-factory"
  | "comms"
  | "chat"
  | "system";

export interface ApprovalOriginInfo {
  origin: ApprovalOrigin;
  /** In-app page of the gated item, when it has one. */
  href?: string;
  /** External origin (GitHub PR/issue, Jira, Slack) — `Approval.sourceUrl`. */
  url?: string;
}

/**
 * Where an approval came from and where to look at it. Derived from `kind` +
 * `runId` (the approval contract carries no origin field); a task-backed kind
 * refines it with the task's own `source` stamp / roadmap provenance.
 */
export function approvalOrigin(
  a: Pick<ContractApproval, "kind" | "runId" | "sourceUrl" | "detail">,
  task?: Pick<ScheduledTask, "source" | "roadmapItemId">,
): ApprovalOriginInfo {
  const url = a.sourceUrl ? { url: a.sourceUrl } : {};
  const run = `/activity/runs/${encodeURIComponent(a.runId)}`;
  switch (a.kind) {
    case "task":
    case "task-output": {
      const s = task?.source;
      const origin: ApprovalOrigin = task?.roadmapItemId
        ? "roadmap"
        : s === "department" || s === "channel" || s === "automation"
          ? s
          : s === "chain" || s === "handoff"
            ? "system"
            : "operator";
      return { origin, href: `/work/tasks/${encodeURIComponent(a.runId)}`, ...url };
    }
    case "agent":
      return { origin: "agent", href: run, ...url };
    case "workflow-stage":
    case "workflow-gate":
    case "workflow-output":
      return { origin: "workflow", href: run, ...url };
    case "channel":
      return { origin: "channel", href: "/activity/inbox", ...url };
    case "comms-graduation":
      return { origin: "comms", href: "/activity/inbox", ...url };
    // Triage stamps the inbound item's url and titles the issue "Bug from <integration>:"
    // (the prefix also covers url-less items and approvals predating the stamp);
    // anything else was filed by hand.
    case "jira-issue":
      return {
        origin: a.sourceUrl || /: Bug from /.test(a.detail) ? "channel" : "operator",
        ...url,
      };
    case "automation-dispatch":
      return { origin: "automation", href: "/automations", ...url };
    case "agent-proposal":
      return {
        origin: "agent-factory",
        href: `/system/registries/positions/${encodeURIComponent(a.runId)}`,
        ...url,
      };
    case "review-rule": {
      const projectId = a.runId.split("/")[0] ?? "";
      return {
        origin: "pr-review",
        href: `/work/projects/${encodeURIComponent(projectId)}`,
        ...url,
      };
    }
    case "routing-proposal":
      return { origin: "roadmap", ...url };
    case "machine":
      return { origin: "chat", ...url };
    case "proposed-task":
    case "handoff-proposal":
      return { origin: "system", ...url };
  }
}

/** Link label for an external source url (`policy.approvals.sheet.sourceLink.*`). */
export function sourceLinkKind(
  url: string,
): "github-pr" | "github-issue" | "jira" | "slack" | "link" {
  if (/github\.com\/.+\/pull\/\d+/.test(url)) return "github-pr";
  if (/github\.com\/.+\/issues\/\d+/.test(url)) return "github-issue";
  if (/atlassian\.net|\/browse\/[A-Z][A-Z0-9]+-\d+/.test(url)) return "jira";
  if (/slack\.com/.test(url)) return "slack";
  return "link";
}

/** Title key for a `workflow-gate` approval (`policy.approvals.sheet.gate.*`), else null. */
export function gateTitleKey(
  a: Pick<ContractApproval, "kind" | "action">,
): "stage-approval" | "spend-past-cap" | null {
  if (a.kind !== "workflow-gate") return null;
  return a.action === "spend-past-cap" ? "spend-past-cap" : "stage-approval";
}
