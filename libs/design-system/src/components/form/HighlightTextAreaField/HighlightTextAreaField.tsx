"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { useRef } from "react";
import { cn } from "../../../utils/cn";
import { Field, fieldControlClass } from "../Field";

export enum HighlightTextAreaFieldTestId {
  /** The outer `position:relative` wrapper hosting both layers. */
  Root = "highlight-text-area-root",
  Control = "highlight-text-area-control",
  Backdrop = "highlight-text-area-backdrop",
  /** Each rendered mark, suffixed with its segment's source offset — e.g.
   *  `highlight-text-area-mark-5`. Segments never share a `start`, so it's a
   *  stable per-segment key (same pattern as `SchedulePicker`'s weekday toggles). */
  Mark = "highlight-text-area-mark",
}

/**
 * The mark palette a highlighted span can be tinted — beyond the default (accent,
 * untoned) look: `accent` (interactive/live — e.g. an `@agent` mention), `push` (the
 * purple risk-category tone — e.g. an `@pipeline` mention), `dim` (a muted, neutral
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

export interface HighlightTextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className" | "children"
> {
  label: string;
  hint?: string;
  error?: string;
  /** Forwarded to {@link Field} — keeps the associated `<label>` in the DOM (so the
   *  control still has an accessible name) but hides it visually. */
  hideLabel?: boolean;
  /**
   * Drop the field's own chrome — border, background and padding — leaving a bare
   * growable text surface. For a host that already frames the composer itself and
   * whose design has no visible field box (the Velín-D chat dock's composer row).
   * Both layers switch together, so the highlight rectangles stay aligned under the
   * glyphs.
   */
  frameless?: boolean;
  /** Controlled text — the backdrop mirrors it to align the highlights. */
  value: string;
  /**
   * Character spans of `value` to highlight inline. Out-of-order, overlapping and
   * out-of-bounds spans are tolerated (clamped, sorted and coalesced).
   */
  highlights: HighlightRange[];
  ref?: Ref<HTMLTextAreaElement>;
}

interface Segment {
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
 * flickers between renders for the same input.
 */
function buildSegments(value: string, highlights: HighlightRange[]): Segment[] {
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

  const segments: Segment[] = [];
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

// Typography/padding shared by both layers so the highlight rectangles sit exactly
// under the textarea's glyphs. `resize-none` (manual resize would desync the layers)
// and `whitespace-pre-wrap break-words` (mirror the textarea's soft-wrapping).
const layerClass = "min-h-20 resize-none whitespace-pre-wrap break-words";

// `frameless`: the same typography with no box at all — no border, no background,
// no padding, no focus ring (the host's own surface carries the focus affordance),
// and a one-line minimum instead of the boxed 5rem.
const framelessControlClass =
  "w-full border-0 bg-transparent p-0 font-sans text-md text-foreground " +
  "placeholder:text-foreground-faint focus:outline-none focus-visible:outline-none";
const framelessLayerClass = "min-h-[22px] resize-none whitespace-pre-wrap break-words";

/**
 * A multi-line text input that highlights character spans of its value inline,
 * while staying fully editable. The highlights live on an `aria-hidden` backdrop
 * that mirrors the text; a transparent textarea sits on top carrying the caret,
 * selection and editing — so the marks appear *behind* the text the user types.
 */
export function HighlightTextAreaField({
  label,
  hint,
  error,
  hideLabel,
  frameless = false,
  value,
  highlights,
  rows = 6,
  onScroll,
  ref,
  ...props
}: HighlightTextAreaFieldProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const segments = buildSegments(value, highlights);
  // Both layers read the SAME pair, so the marks keep sitting exactly under the glyphs.
  const controlClass = frameless ? framelessControlClass : fieldControlClass;
  const sizingClass = frameless ? framelessLayerClass : layerClass;

  return (
    <Field error={error} hideLabel={hideLabel} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <div className="relative" data-testid={HighlightTextAreaFieldTestId.Root}>
          <div
            aria-hidden
            className={cn(
              controlClass,
              sizingClass,
              "pointer-events-none absolute inset-0 select-none overflow-hidden text-transparent",
            )}
            data-testid={HighlightTextAreaFieldTestId.Backdrop}
            ref={backdropRef}
          >
            {segments.map((seg) =>
              seg.mark ? (
                <mark
                  className={cn(
                    "rounded-sm text-transparent",
                    seg.tone ? cn(toneBgClass[seg.tone], toneRingClass[seg.tone]) : "bg-accent/20",
                  )}
                  data-testid={`${HighlightTextAreaFieldTestId.Mark}-${seg.start}`}
                  key={seg.start}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={seg.start}>{seg.text}</span>
              ),
            )}
            {/* Mirror the textarea's trailing caret line so scroll alignment holds. */}
            {"\n"}
          </div>
          <textarea
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(controlClass, sizingClass, "relative bg-transparent")}
            data-testid={HighlightTextAreaFieldTestId.Control}
            id={id}
            onScroll={(event) => {
              const backdrop = backdropRef.current;
              if (backdrop) {
                backdrop.scrollTop = event.currentTarget.scrollTop;
                backdrop.scrollLeft = event.currentTarget.scrollLeft;
              }
              onScroll?.(event);
            }}
            ref={ref}
            rows={rows}
            value={value}
            {...props}
          />
        </div>
      )}
    </Field>
  );
}
