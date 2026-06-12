import type { Approval as ContractApproval } from "@zibby/contracts";
import type { IconName, TagTone } from "@zibby/design-system";

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

export type ApprovalActorKind = "skill" | "agent" | "pipeline";

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

/** The enrichment we (optionally) find packed into `Approval.detail`. */
export interface ApprovalEnrichment {
  riskType?: RiskType;
  actorKind?: ApprovalActorKind;
  glyph?: IconName;
  summary?: string;
  consequence?: string;
  via?: string;
  preview?: ApprovalPreview;
}

/** A contract approval plus the parsed enrichment (or a plain-text fallback). */
export interface DashboardApproval
  extends ContractApproval, ApprovalEnrichment {
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
  if (
    !isRecord(data) ||
    !("preview" in data || "riskType" in data || "summary" in data)
  ) {
    return { ...a, text: a.detail };
  }
  const e = data as ApprovalEnrichment;
  // Overwrite `detail` with the human summary so any consumer that shows the raw
  // `detail` line (e.g. the overview ApprovalCard) reads cleanly, while this
  // screen uses the structured `preview`/`consequence` fields directly.
  return { ...a, ...e, detail: e.summary ?? a.detail };
}

/** Tone usable for Card / Typography / StatusDot / Icon / Stat (excludes Badge-only tones). */
export type UiTone = "accent" | "ok" | "warn" | "bad";

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
