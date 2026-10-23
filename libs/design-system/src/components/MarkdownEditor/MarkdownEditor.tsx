"use client";

import { type CSSProperties, useId } from "react";
import MDEditor, { commands } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { useResolvedTheme } from "../../DesignSystemContext/hooks";
import { Stack } from "../Stack/Stack";

export enum MarkdownEditorTestId {
  Root = "markdown-editor-root",
  Label = "markdown-editor-label",
  /** Wrapper carrying the editor's `data-color-mode` (follows the DS theme). */
  Frame = "markdown-editor-frame",
  Control = "markdown-editor-control",
  Hint = "markdown-editor-hint",
}

const labelClass =
  "font-sans font-semibold uppercase tracking-wider text-[11px] text-foreground-faint";

/**
 * Map the third-party editor's GitHub-primer colour variables onto the live
 * z.i.b.b.y tokens so the rich editor inherits the Zibby 2.0 palette instead of
 * shipping its own skin. Applied inline on the editor root and the preview pane
 * themselves: the library re-declares these vars on `.wmde-markdown-var` per
 * `data-color-mode`, so values inherited from a wrapper would lose to GitHub's
 * near-black dark canvas. The canvas is transparent — the editor sits on
 * whatever surface hosts it — and the frame is a rounded `--line2` hairline.
 * The cast keeps the CSS custom properties type-safe in `style`.
 */
const themeVars = {
  "--color-canvas-default": "transparent",
  "--color-canvas-subtle": "var(--color-panel-2)",
  "--color-border-default": "var(--color-line-2)",
  "--color-border-muted": "var(--color-line)",
  "--color-fg-default": "var(--color-foreground)",
  "--color-fg-muted": "var(--color-foreground-dim)",
  "--color-fg-subtle": "var(--color-foreground-faint)",
  "--color-accent-fg": "var(--color-accent)",
  "--color-accent-emphasis": "var(--color-accent)",
  "--color-neutral-muted": "var(--color-hover)",
  "--md-editor-font-family": "var(--font-sans)",
} as CSSProperties;

/** The editor root: the vars above plus the rounded card frame (`--radius`). */
const editorStyle = {
  ...themeVars,
  borderRadius: "var(--radius)",
  overflow: "hidden",
} as CSSProperties;

export interface MarkdownEditorProps {
  /** Markdown body. Frontmatter is owned elsewhere and never edited here. */
  value: string;
  onChange: (value: string) => void;
  /** Uppercase field label rendered above the editor. */
  label?: string;
  /** Helper text rendered under the editor. */
  hint?: string;
  placeholder?: string;
  /** Accessible name for the textarea when no visible `label` is provided. */
  ariaLabel?: string;
}

/**
 * Rich Markdown editor (toolbar + Editor/Náhled toggle) wrapping
 * `@uiw/react-md-editor`, re-themed to the design-system tokens. The editor
 * only ever sees the Markdown *body*: YAML frontmatter is assembled by the
 * backend from structured fields, never typed here.
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  hint,
  placeholder,
  ariaLabel,
}: MarkdownEditorProps) {
  const id = useId();
  const theme = useResolvedTheme();
  // Declared (not an inline literal) so the extra `data-testid`, absent from
  // the third-party `ITextAreaProps`, passes structural assignability instead
  // of tripping the excess-property check.
  const textareaProps = {
    id,
    placeholder,
    spellCheck: false,
    "aria-label": ariaLabel ?? label,
    "data-testid": MarkdownEditorTestId.Control,
  };
  return (
    <Stack data-testid={MarkdownEditorTestId.Root} gap="100">
      {label && (
        <label className={labelClass} data-testid={MarkdownEditorTestId.Label} htmlFor={id}>
          {label}
        </label>
      )}
      <div data-color-mode={theme} data-testid={MarkdownEditorTestId.Frame}>
        <MDEditor
          extraCommands={[commands.codeEdit, commands.codePreview]}
          height={420}
          onChange={(next) => onChange(next ?? "")}
          preview="edit"
          previewOptions={{ style: themeVars }}
          style={editorStyle}
          textareaProps={textareaProps}
          value={value}
          visibleDragbar={false}
        />
      </div>
      {hint && (
        <span
          className="font-sans text-xs text-foreground-faint"
          data-testid={MarkdownEditorTestId.Hint}
        >
          {hint}
        </span>
      )}
    </Stack>
  );
}
