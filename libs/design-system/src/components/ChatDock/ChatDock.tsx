"use client";
import type { ReactNode, Ref } from "react";
import { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { Typography } from "../Typography/Typography";

export enum ChatDockTestId {
  Root = "chat-dock-root",
  Transcript = "chat-dock-transcript",
  Header = "chat-dock-header",
  CloseButton = "chat-dock-close-button",
  Messages = "chat-dock-messages",
  LatestLine = "chat-dock-latest-line",
  Footer = "chat-dock-footer",
  Toggle = "chat-dock-toggle",
  ToggleIcon = "chat-dock-toggle-icon",
  TargetChip = "chat-dock-target-chip",
  Composer = "chat-dock-composer",
}

export interface ChatDockProps {
  /** Controlled open state — omit to let `ChatDock` manage it internally. */
  open?: boolean;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Message list — a `LogStream`-like transcript, only rendered when open. */
  transcript?: ReactNode;
  /** The composer row — a render slot (`TextArea` + attach + mic + send); the
   *  engine wiring lands in ZB-12, `ChatDock` only positions it. */
  composer: ReactNode;
  /** DS App mock O-20's target chip, e.g. "→ Dept: dev". */
  targetChip?: ReactNode;
  /** A one-line preview of the latest message, shown above the composer only
   *  while collapsed. */
  latestLine?: string;
  /** Accessible name for the open/close toggle. */
  toggleLabel?: string;
  closeLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8's "COO dock" — a fixed-width panel `AppFrame`'s `dock` slot floats
 * bottom-right over the main content. Presentational only: the transcript,
 * composer and target chip are all slots the app fills in; `ChatDock` owns
 * only the open/collapsed choreography and the always-visible bottom bar
 * (toggle, latest-line preview, target chip, composer).
 *
 * Identity chrome (avatar, agent name, role label) is deliberately absent for
 * now — just the text row — until that visual is designed.
 */
export function ChatDock({
  open,
  defaultOpen = false,
  onOpenChange,
  transcript,
  composer,
  targetChip,
  latestLine,
  toggleLabel = "Chat",
  closeLabel = "Close",
  ref,
}: ChatDockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      className="flex w-[420px] max-w-[calc(100vw-40px)] flex-col border border-ink bg-panel"
      data-testid={ChatDockTestId.Root}
      ref={ref}
    >
      {isOpen && (
        <div
          className="flex h-[440px] flex-col border-b border-line"
          data-testid={ChatDockTestId.Transcript}
        >
          <div
            className="flex items-center justify-end border-b border-line px-3.5 py-3"
            data-testid={ChatDockTestId.Header}
          >
            <Button
              data-testid={ChatDockTestId.CloseButton}
              intent="secondary"
              onClick={() => setOpen(false)}
              size="sm"
            >
              {closeLabel}
            </Button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-3.5"
            data-testid={ChatDockTestId.Messages}
          >
            {transcript}
          </div>
        </div>
      )}

      {!isOpen && latestLine && (
        <div className="border-b border-line px-3.5 py-2.5" data-testid={ChatDockTestId.LatestLine}>
          <Typography truncate type="bodySm" variant="secondary">
            {latestLine}
          </Typography>
        </div>
      )}

      <div className="flex items-center gap-2.5 p-2 pl-3" data-testid={ChatDockTestId.Footer}>
        <button
          aria-expanded={isOpen}
          aria-label={toggleLabel}
          className={cn(
            "inline-flex shrink-0 items-center justify-center p-1 text-foreground-dim",
            focusRing,
          )}
          data-testid={ChatDockTestId.Toggle}
          onClick={() => setOpen(!isOpen)}
          type="button"
        >
          <span
            className={cn(
              "inline-flex transition-transform duration-150",
              isOpen ? "rotate-90" : "-rotate-90",
            )}
            data-testid={ChatDockTestId.ToggleIcon}
          >
            <Icon name="chevron" />
          </span>
        </button>

        {targetChip && <span data-testid={ChatDockTestId.TargetChip}>{targetChip}</span>}

        {/* The composer's own frame — `CommandLine`'s `frameless` prop drops its
         *  usual border/background on the assumption the host supplies one; this
         *  is that surface (DS.md §6, sharp corners, no `Card` chrome). */}
        <div
          className="min-w-0 flex-1 border border-border-strong bg-background"
          data-testid={ChatDockTestId.Composer}
        >
          {composer}
        </div>
      </div>
    </div>
  );
}
