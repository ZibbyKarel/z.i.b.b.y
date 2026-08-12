"use client";

import { type CSSProperties, type ComponentProps } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";

/**
 * The renderer's `components` prop type, pulled off `MDEditor.Markdown` itself
 * instead of importing `react-markdown` directly: it's a transitive dependency
 * (via `@uiw/react-markdown-preview`), not one of ours, so importing its types
 * by name would reach past a package we don't declare.
 */
type MarkdownRendererComponents = ComponentProps<typeof MDEditor.Markdown>["components"];

export enum MarkdownTestId {
  Root = "markdown-view",
  Heading = "markdown-heading",
  ListItem = "markdown-list-item",
  Strong = "markdown-strong",
  CodeBlock = "markdown-code-block",
}

/** Minimal shape of the mdast nodes the escape plugin walks (no external dep). */
interface MdNode {
  type: string;
  children?: MdNode[];
}

/**
 * Remark plugin: re-type raw-HTML mdast nodes (`<Foo>`, `<div>` written inline in
 * prose) as plain text, so the renderer shows the literal tag instead of letting
 * the downstream `rehype-raw` parse it into an (often empty, invisible) element.
 * Fenced/inline code is a `code`/`inlineCode` node, not `html`, so it is untouched.
 * Used by {@link Markdown} when `escapeHtml` is set: the right choice for
 * untrusted model/agent output (it also closes a raw-HTML injection vector). A
 * hand-rolled walk keeps `unist-util-visit` out of the dependency surface.
 */
function remarkEscapeRawHtml() {
  return (tree: MdNode): void => {
    const walk = (node: MdNode): void => {
      if (node.type === "html") node.type = "text";
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

const ESCAPE_HTML_PLUGINS = [remarkEscapeRawHtml];

/**
 * Tags the rendered nodes tests (and any future caller) need to select by id
 * rather than by role/text/querySelector: headings, list items, bold text, and
 * code blocks. Passed as `components` to the underlying `react-markdown` renderer.
 */
const testIdComponents: MarkdownRendererComponents = {
  h1: (props) => <h1 data-testid={MarkdownTestId.Heading} {...props} />,
  h2: (props) => <h2 data-testid={MarkdownTestId.Heading} {...props} />,
  h3: (props) => <h3 data-testid={MarkdownTestId.Heading} {...props} />,
  h4: (props) => <h4 data-testid={MarkdownTestId.Heading} {...props} />,
  h5: (props) => <h5 data-testid={MarkdownTestId.Heading} {...props} />,
  h6: (props) => <h6 data-testid={MarkdownTestId.Heading} {...props} />,
  li: (props) => <li data-testid={MarkdownTestId.ListItem} {...props} />,
  strong: (props) => <strong data-testid={MarkdownTestId.Strong} {...props} />,
  code: (props) => <code data-testid={MarkdownTestId.CodeBlock} {...props} />,
};

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
  /** Markdown source to render (the note/document body, no frontmatter). */
  source: string;
  /**
   * Render raw HTML tokens (`<Foo>`, `<div>`) in prose as literal text instead of
   * parsing them as HTML. Defaults to `false` (notes/briefings may use intentional
   * inline HTML). Set for untrusted model/agent output, where a stray `<Component>`
   * would otherwise vanish into an empty element.
   */
  escapeHtml?: boolean;
}

/**
 * Read-only markdown viewer that renders a markdown body (headings, lists,
 * emphasis, code, links) themed to the design-system tokens. Wraps
 * `@uiw/react-md-editor`'s `Markdown` renderer (already a dependency via
 * {@link MarkdownEditor}), so it adds no new dependency and no hand-rolled parser.
 * Frontmatter is owned elsewhere and never rendered here.
 */
export function Markdown({ source, escapeHtml = false }: MarkdownProps) {
  return (
    <div data-color-mode="dark" data-testid={MarkdownTestId.Root} style={themeVars}>
      <MDEditor.Markdown
        components={testIdComponents}
        remarkPlugins={escapeHtml ? ESCAPE_HTML_PLUGINS : undefined}
        source={source}
        style={{ background: "transparent" }}
      />
    </div>
  );
}
