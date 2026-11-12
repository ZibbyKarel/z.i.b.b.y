import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../Button/Button";

export enum CopyableTestId {
  Root = "copyable-root",
  Copy = "copyable-copy",
  Status = "copyable-status",
}

export interface CopyableProps {
  /** What the copy button writes to the clipboard. */
  text: string;
  /** Anything to show (text, a link, a code chip). Defaults to `text`. */
  children?: ReactNode;
  /** Accessible name + tooltip of the copy button. */
  copyLabel?: string;
  /** Shown and announced for ~1.5 s after a successful copy. */
  copiedLabel?: string;
  /** Shown and announced when the clipboard write fails (denied, insecure context). */
  copyFailedLabel?: string;
  /** `hover` (default) reveals the icon on hover / focus; `always` keeps it visible. */
  reveal?: "hover" | "always";
}

const FEEDBACK_MS = 1500;

/**
 * Wraps any content with a copy icon button that copies `text`. In `hover` mode the button's
 * space is always reserved (opacity, not display) so nothing shifts; it stays focusable while hidden.
 * After a click the icon turns into a check / cross and a polite live region says what happened.
 */
export function Copyable({
  text,
  children,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  copyFailedLabel = "Copy failed",
  reveal = "hover",
}: CopyableProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () => {
    const write = navigator.clipboard?.writeText(text);
    if (!write) return setState("failed");
    write.then(
      () => setState("copied"),
      () => setState("failed"),
    );
  };

  return (
    <span
      className="group inline-flex min-w-0 items-center gap-1"
      data-testid={CopyableTestId.Root}
    >
      {children ?? text}
      {/* negative margin cancels the button's padding so the line height is unchanged */}
      <span
        className={
          reveal === "always" || state !== "idle"
            ? "-my-[7px] inline-flex"
            : "-my-[7px] inline-flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        }
      >
        <Button
          aria-label={copyLabel}
          data-testid={CopyableTestId.Copy}
          icon={state === "copied" ? "check" : state === "failed" ? "x" : "copy"}
          intent="ghost"
          onClick={copy}
          size="sm"
          title={copyLabel}
        />
      </span>
      <span
        aria-live="polite"
        className={
          state === "failed" ? "text-bad shrink-0 text-xs" : "text-foreground-dim shrink-0 text-xs"
        }
        data-testid={CopyableTestId.Status}
      >
        {state === "copied" ? copiedLabel : state === "failed" ? copyFailedLabel : null}
      </span>
    </span>
  );
}
