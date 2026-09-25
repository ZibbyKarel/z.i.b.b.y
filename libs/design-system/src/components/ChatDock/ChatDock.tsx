"use client";
import type { ReactNode, Ref } from "react";
import { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Button } from "../Button/Button";
import { Typography } from "../Typography/Typography";

export enum ChatDockTestId {
  Root = "chat-dock-root",
  Transcript = "chat-dock-transcript",
  Header = "chat-dock-header",
  Avatar = "chat-dock-avatar",
  Title = "chat-dock-title",
  Role = "chat-dock-role",
  CloseButton = "chat-dock-close-button",
  Messages = "chat-dock-messages",
  LatestLine = "chat-dock-latest-line",
  Footer = "chat-dock-footer",
  Toggle = "chat-dock-toggle",
  ToggleAvatar = "chat-dock-toggle-avatar",
  TargetChip = "chat-dock-target-chip",
  Composer = "chat-dock-composer",
}

export interface ChatDockProps {
  /** Controlled open state — omit to let `ChatDock` manage it internally. */
  open?: boolean;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Agent identity — DS App mock's "Zibby · COO". */
  agentName?: string;
  roleLabel?: string;
  /** The agent's `AgentGlyph`/`IconTile`, rendered in the header and the
   *  collapsed toggle. */
  avatar?: ReactNode;
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
  toggleLabel?: string;
  closeLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8's "COO dock" — a fixed-width panel `AppFrame`'s `dock` slot floats
 * bottom-right over the main content. Presentational only: the transcript,
 * composer and target chip are all slots the app fills in; `ChatDock` owns
 * only the open/collapsed choreography and the always-visible bottom bar
 * (toggle avatar, latest-line preview, target chip, composer).
 */
export function ChatDock({
  open,
  defaultOpen = false,
  onOpenChange,
  agentName = "Zibby",
  roleLabel = "COO · Routes, classifies, chats",
  avatar,
  transcript,
  composer,
  targetChip,
  latestLine,
  toggleLabel,
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
            className="flex items-center gap-2.5 border-b border-line px-3.5 py-3"
            data-testid={ChatDockTestId.Header}
          >
            {avatar && <span data-testid={ChatDockTestId.Avatar}>{avatar}</span>}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Typography data-testid={ChatDockTestId.Title} type="body" weight="medium">
                {agentName}
              </Typography>
              <Typography
                data-testid={ChatDockTestId.Role}
                tracking="wider"
                type="labelSm"
                variant="tertiary"
              >
                {roleLabel}
              </Typography>
            </div>
            <Button
              data-testid={ChatDockTestId.CloseButton}
              intent="secondary"
              onClick={() => setOpen(false)}
              size="sm"
            >
              {closeLabel}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3.5" data-testid={ChatDockTestId.Messages}>
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

      <div
        className="flex items-center gap-2.5 p-2 pl-3"
        data-testid={ChatDockTestId.Footer}
      >
        <button
          aria-expanded={isOpen}
          aria-label={toggleLabel ?? agentName}
          className={cn("inline-flex shrink-0 items-center gap-2", focusRing)}
          data-testid={ChatDockTestId.Toggle}
          onClick={() => setOpen(!isOpen)}
          type="button"
        >
          {avatar && <span data-testid={ChatDockTestId.ToggleAvatar}>{avatar}</span>}
          <Typography tracking="wider" type="labelSm" variant="secondary">
            {agentName}
          </Typography>
        </button>

        {targetChip && <span data-testid={ChatDockTestId.TargetChip}>{targetChip}</span>}

        <div className="min-w-0 flex-1" data-testid={ChatDockTestId.Composer}>
          {composer}
        </div>
      </div>
    </div>
  );
}
