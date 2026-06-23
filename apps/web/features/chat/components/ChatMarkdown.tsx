 
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChatMarkdownProps {
  /** Raw markdown text from the assistant turn (may be mid-stream/partial). */
  text: string;
}

/**
 * Renders an assistant turn's markdown as readable prose. ZIBBY (the `claude` CLI)
 * emits GitHub-flavoured markdown — `**bold**`, lists, headings, code fences — which
 * read as literal markup without a formatter. `react-markdown` + `remark-gfm` turn it
 * into real elements; the `.chat-md` scope styles them from tokens (Tailwind v4
 * preflight strips the UA defaults, so spacing/markers live in globals.css).
 *
 * It renders **during streaming too** (like claude.ai): a half-typed `**` simply snaps
 * to bold once the closing marker arrives. The live cursor is a sibling element in
 * {@link ChatMessage}, never part of this markdown string.
 */
export function ChatMarkdown({ text }: ChatMarkdownProps) {
  return (
    <div className="chat-md">
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
