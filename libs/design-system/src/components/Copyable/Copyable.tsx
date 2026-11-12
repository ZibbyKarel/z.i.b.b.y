import type { ReactNode } from "react";
import { Button } from "../Button/Button";

export enum CopyableTestId {
  Root = "copyable-root",
  Copy = "copyable-copy",
}

export interface CopyableProps {
  /** What the copy button writes to the clipboard. */
  text: string;
  /** Anything to show (text, a link, a code chip). Defaults to `text`. */
  children?: ReactNode;
  /** Accessible name + tooltip of the copy button. */
  copyLabel?: string;
  /** `hover` (default) reveals the icon on hover / focus; `always` keeps it visible. */
  reveal?: "hover" | "always";
}

/**
 * Wraps any content with a copy icon button that copies `text`. In `hover` mode the button's
 * space is always reserved (opacity, not display) so nothing shifts; it stays focusable while hidden.
 */
export function Copyable({ text, children, copyLabel = "Copy", reveal = "hover" }: CopyableProps) {
  return (
    <span
      className="group inline-flex min-w-0 items-center gap-1"
      data-testid={CopyableTestId.Root}
    >
      {children ?? text}
      {/* negative margin cancels the button's padding so the line height is unchanged */}
      <span
        className={
          reveal === "always"
            ? "-my-[7px] inline-flex"
            : "-my-[7px] inline-flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        }
      >
        <Button
          aria-label={copyLabel}
          data-testid={CopyableTestId.Copy}
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
