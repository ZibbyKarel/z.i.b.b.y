import { Button } from "../Button/Button";

export enum CopyableTextTestId {
  Root = "copyable-text-root",
  Text = "copyable-text-text",
  Copy = "copyable-text-copy",
}

export interface CopyableTextProps {
  /** The text shown and copied. */
  text: string;
  /** Accessible name + tooltip of the copy button. */
  copyLabel?: string;
  /** Render the text in the mono (machine data) voice, never caps. Default true. */
  mono?: boolean;
}

/**
 * Inline text with a copy icon button that appears on hover / keyboard focus. The button's space
 * is always reserved (opacity, not display) so nothing shifts; it stays focusable while hidden.
 */
export function CopyableText({ text, copyLabel = "Copy", mono = true }: CopyableTextProps) {
  return (
    <span className="group inline-flex items-center gap-1" data-testid={CopyableTextTestId.Root}>
      <span
        className={mono ? "font-mono normal-case tracking-normal" : undefined}
        data-testid={CopyableTextTestId.Text}
      >
        {text}
      </span>
      {/* negative margin cancels the button's padding so the text line height is unchanged */}
      <span className="-my-[7px] inline-flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          aria-label={copyLabel}
          data-testid={CopyableTextTestId.Copy}
          icon="copy"
          intent="ghost"
          onClick={() => void navigator.clipboard?.writeText(text).catch(() => {})}
          size="sm"
          title={copyLabel}
        />
      </span>
    </span>
  );
}
