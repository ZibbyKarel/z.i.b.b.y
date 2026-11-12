import { Copyable, CopyableTestId } from "../Copyable/Copyable";

export enum CopyableTextTestId {
  Root = CopyableTestId.Root,
  Text = "copyable-text-text",
  Copy = CopyableTestId.Copy,
}

export interface CopyableTextProps {
  /** The text shown and copied. */
  text: string;
  /** Accessible name + tooltip of the copy button. */
  copyLabel?: string;
  /** See `Copyable`. */
  copiedLabel?: string;
  /** See `Copyable`. */
  copyFailedLabel?: string;
  /** Render the text in the mono (machine data) voice, never caps. Default true. */
  mono?: boolean;
}

/** Inline text with a hover copy icon — `Copyable` around the text itself. */
export function CopyableText({
  text,
  copyLabel = "Copy",
  copiedLabel,
  copyFailedLabel,
  mono = true,
}: CopyableTextProps) {
  return (
    <Copyable
      copiedLabel={copiedLabel}
      copyFailedLabel={copyFailedLabel}
      copyLabel={copyLabel}
      text={text}
    >
      <span
        className={mono ? "font-mono normal-case tracking-normal" : undefined}
        data-testid={CopyableTextTestId.Text}
      >
        {text}
      </span>
    </Copyable>
  );
}
