"use client";

import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { cn } from "../../utils/cn";

export enum CodeBlockTestId {
  Root = "code-block-root",
  Pre = "code-block-pre",
  Caret = "code-block-caret",
  Placeholder = "code-block-placeholder",
}

export type CodeBlockHeight = "sm" | "md" | "lg" | "viewport";

/** Scroll-area max heights, sealed to a small scale. */
const maxHeightClass: Record<CodeBlockHeight, string> = {
  sm: "max-h-60", // 240px
  md: "max-h-[340px]",
  lg: "max-h-[440px]",
  viewport: "max-h-[55vh]",
};

export interface CodeBlockProps {
  /** Monospace text; rendered with `pre-wrap` so whitespace/newlines survive. */
  text: string;
  maxHeight?: CodeBlockHeight;
  /** Auto-scroll to the bottom whenever {@link scrollKey} changes (log tailing). */
  followTail?: boolean;
  /** Dependency that re-triggers the tail scroll — pass the streamed text. */
  scrollKey?: string | number;
  /** Shown in place of the text while it is empty (e.g. "waiting…"). */
  placeholder?: ReactNode;
  /** Render a blinking accent caret after the text — a live-stream affordance. */
  caret?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A scrollable monospace text region — the recurring log/terminal/diff readout.
 * Domain-neutral: it only renders text, optionally tailing a live stream.
 */
export function CodeBlock({
  text,
  maxHeight = "md",
  followTail = false,
  scrollKey,
  placeholder,
  caret = false,
  ref,
}: CodeBlockProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!followTail) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [followTail, scrollKey]);

  const empty = text.length === 0;

  return (
    <div
      className={cn("overflow-auto p-3", maxHeightClass[maxHeight])}
      data-testid={CodeBlockTestId.Root}
      ref={mergeRefs(scrollRef, ref)}
    >
      {empty && placeholder ? (
        <span data-testid={CodeBlockTestId.Placeholder}>{placeholder}</span>
      ) : (
        <pre
          className="m-0 font-mono text-s leading-relaxed break-words whitespace-pre-wrap text-foreground"
          data-testid={CodeBlockTestId.Pre}
        >
          {text}
          {caret && (
            <span className="text-accent" data-testid={CodeBlockTestId.Caret}>
              ▍
            </span>
          )}
        </pre>
      )}
    </div>
  );
}

/** Set both the internal scroll ref and a forwarded consumer ref. */
function mergeRefs(
  internal: { current: HTMLDivElement | null },
  external?: Ref<HTMLDivElement>,
) {
  return (node: HTMLDivElement | null) => {
    internal.current = node;
    if (typeof external === "function") external(node);
    else if (external) (external as { current: HTMLDivElement | null }).current = node;
  };
}
