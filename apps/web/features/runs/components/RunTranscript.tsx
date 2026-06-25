"use client";

import { type CSSProperties, type ReactNode, memo, useEffect, useMemo, useRef } from "react";
import { type CodeBlockHeight, Container, Markdown, Stack, Typography } from "@zibby/design-system";
import { type TranscriptSegment, parseTranscript } from "../transcript";

export enum RunTranscriptTestId {
  Root = "run-transcript-root",
  Caret = "run-transcript-caret",
  Placeholder = "run-transcript-placeholder",
  Tool = "run-transcript-tool",
  Result = "run-transcript-result",
  System = "run-transcript-system",
  Thinking = "run-transcript-thinking",
  Footer = "run-transcript-footer",
}

/** Mirror {@link CodeBlock}'s sealed height scale so this is a drop-in swap. */
const maxHeightPx: Record<CodeBlockHeight, string> = {
  sm: "240px",
  md: "340px",
  lg: "440px",
  viewport: "55vh",
};

/** Mono rows keep whitespace — result indentation and wrapped tool commands. */
const preWrap: CSSProperties = { whiteSpace: "pre-wrap" };
const preWrapItalic: CSSProperties = { ...preWrap, fontStyle: "italic" };

export interface RunTranscriptProps {
  /** The flattened transcript log to render (see {@link parseTranscript}). */
  text: string;
  /** Whether the run is still producing output — drives the trailing caret. */
  live: boolean;
  /** Dependency that re-triggers the tail scroll — pass the streamed `text`. */
  scrollKey?: string | number;
  /** Shown in place of the transcript while it is empty (e.g. "waiting…"). */
  placeholder?: ReactNode;
  maxHeight?: CodeBlockHeight;
}

/**
 * Formatted view of a run's flattened transcript: the agent's own text renders as
 * markdown while the tool-call / result / header scaffolding stays legible as mono
 * rows. A drop-in replacement for the log `CodeBlock` (same follow-tail behaviour
 * and prop surface), so the existing call sites barely change.
 *
 * The log tail-polls — `text` grows every tick — so the parse is memoised on
 * `text` and each markdown segment is `React.memo`'d on its source, keeping
 * earlier (unchanged) segments from re-running remark/rehype as the tail grows.
 */
export function RunTranscript({
  text,
  live,
  scrollKey,
  placeholder,
  maxHeight = "viewport",
}: RunTranscriptProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const segments = useMemo(() => parseTranscript(text), [text]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  return (
    <Container
      data-testid={RunTranscriptTestId.Root}
      maxHeight={maxHeightPx[maxHeight]}
      overflow="auto"
      padding="150"
      ref={scrollRef}
    >
      {text.length === 0 && placeholder ? (
        <Typography
          mono
          data-testid={RunTranscriptTestId.Placeholder}
          size="2xs"
          type="note"
          variant="tertiary"
        >
          {placeholder}
        </Typography>
      ) : (
        <Stack gap="100">
          {segments.map((seg, i) => (
            <Segment key={i} seg={seg} />
          ))}
          {live && (
            <Typography
              mono
              data-testid={RunTranscriptTestId.Caret}
              tone="accent"
              type="note"
            >
              ▍
            </Typography>
          )}
        </Stack>
      )}
    </Container>
  );
}

/** One transcript segment. Markdown is memoised separately (see {@link MarkdownSegment}). */
function Segment({ seg }: { seg: TranscriptSegment }) {
  switch (seg.kind) {
    case "text":
      return <MarkdownSegment source={seg.markdown} />;
    case "system":
      return (
        <Typography
          mono
          data-testid={RunTranscriptTestId.System}
          size="2xs"
          type="note"
          variant="tertiary"
        >
          ▶ {seg.text}
        </Typography>
      );
    case "thinking":
      return (
        <Typography
          mono
          data-testid={RunTranscriptTestId.Thinking}
          size="2xs"
          style={preWrapItalic}
          type="note"
          variant="tertiary"
        >
          💭 {seg.text}
        </Typography>
      );
    case "tool":
      return (
        <Stack align="start" data-testid={RunTranscriptTestId.Tool} direction="row" gap="100">
          <Typography mono size="2xs" tone="accent" type="note">
            ●
          </Typography>
          <Typography mono size="2xs" style={preWrap} type="note" variant="secondary">
            {seg.text}
          </Typography>
        </Stack>
      );
    case "result":
      return (
        <Typography
          mono
          data-testid={RunTranscriptTestId.Result}
          size="2xs"
          style={preWrap}
          type="note"
          variant="tertiary"
        >
          {seg.text}
        </Typography>
      );
    case "footer":
      return (
        <Typography
          mono
          data-testid={RunTranscriptTestId.Footer}
          size="2xs"
          type="note"
          variant="tertiary"
        >
          ─── {seg.text}
        </Typography>
      );
  }
}

/**
 * `MDEditor.Markdown` runs remark/rehype on every render and isn't cheap — memo on
 * the source string so an unchanged earlier segment is skipped while the tail grows.
 */
const MarkdownSegment = memo(function MarkdownSegment({ source }: { source: string }) {
  // Agent text is untrusted model output — render stray `<Component>` tokens as
  // literal text instead of letting them vanish into empty HTML elements.
  return <Markdown escapeHtml source={source} />;
});
