import { cn } from "../../../utils/cn";

/**
 * The mark palette a highlighted span can be tinted — beyond the default (accent,
 * untoned) look: `accent` (interactive/live — e.g. an `@agent` mention), `push` (the
 * purple risk-category tone — e.g. an `@workflow` mention), `dim` (a muted, neutral
 * span — e.g. an unresolved `@file` mention). Omitting `tone` keeps the original
 * single-style mark (`bg-accent/20`, no ring) byte-identical for existing callers.
 */
export type HighlightTone = "accent" | "push" | "dim";

/** A `[start, end)` character span of the value to highlight (e.g. a detected path). */
export interface HighlightRange {
  start: number;
  end: number;
  /** Per-range tint; omit for the default untoned mark. */
  tone?: HighlightTone;
}

export interface HighlightSegment {
  /** Source offset — a stable React key (segments never share a start). */
  start: number;
  text: string;
  mark: boolean;
  tone?: HighlightTone;
}

/**
 * Split `value` into highlighted / plain segments. Spans are clamped to the value,
 * empties dropped, then sorted and merged so overlapping highlights render as one
 * mark and the offsets stay monotonic. When two overlapping ranges disagree on
 * `tone`, the earlier (lower `start`) range's tone wins — deterministic, never
 * flickers between renders for the same input. Shared by the editable
 * `HighlightTextAreaField` backdrop and the read-only `HighlightText`/`Markdown`
 * renderers, so a span looks the same while typed and once sent.
 */
export function buildSegments(value: string, highlights: HighlightRange[]): HighlightSegment[] {
  const len = value.length;
  const ranges = highlights
    .map((h) => ({
      start: Math.max(0, Math.min(h.start, len)),
      end: Math.max(0, Math.min(h.end, len)),
      tone: h.tone,
    }))
    .filter((h) => h.end > h.start)
    .sort((a, b) => a.start - b.start);

  const merged: HighlightRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor)
      segments.push({ start: cursor, text: value.slice(cursor, range.start), mark: false });
    segments.push({
      start: range.start,
      text: value.slice(range.start, range.end),
      mark: true,
      tone: range.tone,
    });
    cursor = range.end;
  }
  if (cursor < len) segments.push({ start: cursor, text: value.slice(cursor), mark: false });
  return segments;
}

/** Tinted background per {@link HighlightTone} — the default (untoned) mark keeps its
 *  original `bg-accent/20` instead of reading from this map. */
const toneBgClass: Record<HighlightTone, string> = {
  accent: "bg-accent/[0.14]",
  push: "bg-risk-push/[0.14]",
  dim: "bg-foreground-dim/[0.14]",
};

/** A faint 1px ring in the tone colour — via `color-mix`, matching the pattern
 *  {@link toneGlow} on `Card` already established for tone-tinted emphasis. */
const toneRingClass: Record<HighlightTone, string> = {
  accent: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]",
  push: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-risk-push)_40%,transparent)]",
  dim: "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-foreground-dim)_40%,transparent)]",
};

/** The tint classes of one mark (background + ring), without any text colour. */
export function markToneClass(tone?: HighlightTone): string {
  return cn("rounded-sm", tone ? cn(toneBgClass[tone], toneRingClass[tone]) : "bg-accent/20");
}
