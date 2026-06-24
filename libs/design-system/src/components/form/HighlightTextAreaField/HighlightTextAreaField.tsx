"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { useRef } from "react";
import { cn } from "../../../utils/cn";
import { Field, fieldControlClass } from "../Field";

export enum HighlightTextAreaFieldTestId {
  Control = "highlight-text-area-control",
  Backdrop = "highlight-text-area-backdrop",
  Mark = "highlight-text-area-mark",
}

/** A `[start, end)` character span of the value to highlight (e.g. a detected path). */
export interface HighlightRange {
  start: number;
  end: number;
}

export interface HighlightTextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className" | "children"
> {
  label: string;
  hint?: string;
  error?: string;
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
}

/**
 * Split `value` into highlighted / plain segments. Spans are clamped to the value,
 * empties dropped, then sorted and merged so overlapping highlights render as one
 * mark and the offsets stay monotonic.
 */
function buildSegments(value: string, highlights: HighlightRange[]): Segment[] {
  const len = value.length;
  const ranges = highlights
    .map((h) => ({
      start: Math.max(0, Math.min(h.start, len)),
      end: Math.max(0, Math.min(h.end, len)),
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
    segments.push({ start: range.start, text: value.slice(range.start, range.end), mark: true });
    cursor = range.end;
  }
  if (cursor < len) segments.push({ start: cursor, text: value.slice(cursor), mark: false });
  return segments;
}

// Typography/padding shared by both layers so the highlight rectangles sit exactly
// under the textarea's glyphs. `resize-none` (manual resize would desync the layers)
// and `whitespace-pre-wrap break-words` (mirror the textarea's soft-wrapping).
const layerClass = "min-h-20 resize-none whitespace-pre-wrap break-words";

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
  value,
  highlights,
  rows = 6,
  onScroll,
  ref,
  ...props
}: HighlightTextAreaFieldProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const segments = buildSegments(value, highlights);

  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <div
            aria-hidden
            className={cn(
              fieldControlClass,
              layerClass,
              "pointer-events-none absolute inset-0 select-none overflow-hidden text-transparent",
            )}
            data-testid={HighlightTextAreaFieldTestId.Backdrop}
            ref={backdropRef}
          >
            {segments.map((seg) =>
              seg.mark ? (
                <mark
                  className="rounded-sm bg-accent/20 text-transparent"
                  data-testid={HighlightTextAreaFieldTestId.Mark}
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
            className={cn(fieldControlClass, layerClass, "relative bg-transparent")}
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
