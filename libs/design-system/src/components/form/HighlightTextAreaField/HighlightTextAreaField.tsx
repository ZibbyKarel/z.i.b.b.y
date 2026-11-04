"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "../../../utils/cn";
import { Field, fieldControlClass } from "../Field";
import { type HighlightRange, buildSegments, markToneClass } from "./highlightSegments";

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

export type { HighlightRange, HighlightTone } from "./highlightSegments";

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
  /**
   * Grow with the text up to this many rows, then scroll. Omitted → fixed at `rows`.
   */
  maxRows?: number;
  /** Controlled text — the backdrop mirrors it to align the highlights. */
  value: string;
  /**
   * Character spans of `value` to highlight inline. Out-of-order, overlapping and
   * out-of-bounds spans are tolerated (clamped, sorted and coalesced).
   */
  highlights: HighlightRange[];
  ref?: Ref<HTMLTextAreaElement>;
}

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
  maxRows,
  onScroll,
  ref,
  ...props
}: HighlightTextAreaFieldProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow: re-measure on every value change, cap at `maxRows` lines.
  useLayoutEffect(() => {
    const el = controlRef.current;
    if (!maxRows || !el) return;
    const css = getComputedStyle(el);
    const line = Number.parseFloat(css.lineHeight) || Number.parseFloat(css.fontSize) * 1.4 || 22;
    const chrome = Number.parseFloat(css.paddingTop) + Number.parseFloat(css.paddingBottom) || 0;
    const max = line * maxRows + chrome;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxRows]);
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
                  className={cn(markToneClass(seg.tone), "text-transparent")}
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
            ref={(node) => {
              controlRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            rows={rows}
            value={value}
            {...props}
          />
        </div>
      )}
    </Field>
  );
}
