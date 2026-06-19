"use client";

import { type CSSProperties, useId } from "react";
import MDEditor, { commands } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { Stack } from "../Stack/Stack";

export enum MarkdownEditorTestId {
  Root = "markdown-editor-root",
  Label = "markdown-editor-label",
  Control = "markdown-editor-control",
  Hint = "markdown-editor-hint",
}

const labelClass = "font-mono text-sm uppercase tracking-wider text-foreground-faint";

/**
 * Map the third-party editor's GitHub-primer colour variables onto the live
 * z.i.b.b.y tokens so the rich editor inherits the HUD palette (background,
 * borders, accent, foreground) instead of shipping its own default skin.
 * The cast keeps the CSS custom properties type-safe in `style`.
 */
const themeVars = {
  "--color-canvas-default": "var(--color-background)",
  "--color-canvas-subtle": "var(--color-surface)",
  "--color-border-default": "var(--color-border)",
  "--color-border-muted": "var(--color-border)",
  "--color-fg-default": "var(--color-foreground)",
  "--color-fg-muted": "var(--color-foreground-dim)",
  "--color-fg-subtle": "var(--color-foreground-faint)",
  "--color-accent-fg": "var(--color-accent)",
  "--color-accent-emphasis": "var(--color-accent)",
  "--color-neutral-muted": "var(--color-surface)",
  borderRadius: "var(--radius)",
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
 * only ever sees the Markdown *body* — YAML frontmatter is assembled by the
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
  // Declared (not an inline literal) so the extra `data-testid` — absent from
  // the third-party `ITextAreaProps` — passes structural assignability instead
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
      <div data-color-mode="dark" style={themeVars}>
        <MDEditor
          extraCommands={[commands.codeEdit, commands.codePreview]}
          height={420}
          onChange={(next) => onChange(next ?? "")}
          preview="edit"
          textareaProps={textareaProps}
          value={value}
          visibleDragbar={false}
        />
      </div>
      {hint && (
        <span
          className="font-mono text-xs text-foreground-faint"
          data-testid={MarkdownEditorTestId.Hint}
        >
          {hint}
        </span>
      )}
    </Stack>
  );
}
