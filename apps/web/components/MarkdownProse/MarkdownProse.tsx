"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export enum MarkdownProseTestId {
  Root = "markdown-prose",
}

export interface MarkdownProseProps {
  /** Raw GitHub-flavoured markdown (may be mid-stream/partial in chat). */
  text: string;
}

/**
 * The single app-level markdown renderer — shared by the chat transcript and any
 * entity detail that stores its body as markdown (an agent's `instructions`, …).
 *
 * ZIBBY (the `claude` CLI) and our entity files emit GitHub-flavoured markdown —
 * `**bold**`, lists, headings, code fences — which read as literal markup without a
 * formatter. `react-markdown` + `remark-gfm` turn it into real elements; the
 * `.md-prose` scope styles them from tokens (Tailwind v4 preflight strips the UA
 * defaults, so spacing/markers live in globals.css).
 *
 * It renders **during streaming too** (like claude.ai): a half-typed `**` simply snaps
 * to bold once the closing marker arrives. The chat live cursor is a sibling element
 * in {@link ChatMessage}, never part of this markdown string.
 */
export function MarkdownProse({ text }: MarkdownProseProps) {
  return (
    <div className="md-prose" data-testid={MarkdownProseTestId.Root}>
      <ReactMarkdown
        components={{
          // Open links in a new tab and never leak the referrer.
          a: ({ href, children }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
