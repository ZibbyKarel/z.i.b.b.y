"use client";

import { type CSSProperties } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";

export enum MarkdownTestId {
  Root = "markdown-view",
}

/**
 * Map the third-party renderer's GitHub-primer colour variables onto the live
 * z.i.b.b.y tokens so rendered markdown inherits the HUD palette (mirrors the
 * mapping `MarkdownEditor` uses for the editor). The cast keeps the CSS custom
 * properties type-safe in `style`.
 */
const themeVars = {
  "--color-canvas-default": "transparent",
  "--color-canvas-subtle": "var(--color-surface)",
  "--color-border-default": "var(--color-border)",
  "--color-border-muted": "var(--color-border)",
  "--color-fg-default": "var(--color-foreground)",
  "--color-fg-muted": "var(--color-foreground-dim)",
  "--color-fg-subtle": "var(--color-foreground-faint)",
  "--color-accent-fg": "var(--color-accent)",
  "--color-accent-emphasis": "var(--color-accent)",
  "--color-neutral-muted": "var(--color-surface)",
} as CSSProperties;

export interface MarkdownProps {
  /** Markdown source to render (the note/document body — no frontmatter). */
  source: string;
}

/**
 * Read-only markdown viewer — renders a markdown body (headings, lists, emphasis,
 * code, links) themed to the design-system tokens. Wraps `@uiw/react-md-editor`'s
 * `Markdown` renderer (already a dependency via {@link MarkdownEditor}), so it adds
 * no new dependency and no hand-rolled parser. Frontmatter is owned elsewhere and
 * never rendered here.
 */
export function Markdown({ source }: MarkdownProps) {
  return (
    <div data-color-mode="dark" data-testid={MarkdownTestId.Root} style={themeVars}>
      <MDEditor.Markdown source={source} style={{ background: "transparent" }} />
    </div>
  );
}
