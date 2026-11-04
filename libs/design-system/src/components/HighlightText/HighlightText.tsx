import {
  type HighlightRange,
  buildSegments,
  markToneClass,
} from "../form/HighlightTextAreaField/highlightSegments";
import { cn } from "../../utils/cn";

export enum HighlightTextTestId {
  Root = "highlight-text",
  /** Each mark, suffixed with its segment's source offset — e.g. `highlight-text-mark-4`. */
  Mark = "highlight-text-mark",
}

export interface HighlightTextProps {
  text: string;
  /** Character spans of `text` to mark — same shape and tones as `HighlightTextAreaField`. */
  highlights: HighlightRange[];
}

/**
 * Read-only counterpart of {@link HighlightTextAreaField}: renders plain text with the
 * same marks, so a span (an `@mention`, a path) looks the same once sent as it did
 * while typed. Whitespace and line breaks are preserved.
 */
export function HighlightText({ text, highlights }: HighlightTextProps) {
  return (
    <span className="whitespace-pre-wrap break-words" data-testid={HighlightTextTestId.Root}>
      {buildSegments(text, highlights).map((seg) =>
        seg.mark ? (
          <mark
            className={cn(markToneClass(seg.tone), "text-inherit")}
            data-testid={`${HighlightTextTestId.Mark}-${seg.start}`}
            key={seg.start}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={seg.start}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
