"use client";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../Button/Button";

export enum ChatDockTestId {
  Root = "chat-dock-root",
  Transcript = "chat-dock-transcript",
  Header = "chat-dock-header",
  NewChatButton = "chat-dock-new-chat-button",
  CloseButton = "chat-dock-close-button",
  Messages = "chat-dock-messages",
  Footer = "chat-dock-footer",
  TargetChip = "chat-dock-target-chip",
  Composer = "chat-dock-composer",
}

export interface ChatDockProps {
  /** Controlled open state — omit to let `ChatDock` manage it internally. */
  open?: boolean;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Message list — only rendered when open. */
  transcript?: ReactNode;
  /** The composer bar — a render slot (input frame + send); `ChatDock` only positions it. */
  composer: ReactNode;
  /** DS App mock O-20's target chip, e.g. "→ Dept: dev". */
  targetChip?: ReactNode;
  /** Shows a "+ New chat" header button when provided. */
  onNewChat?: () => void;
  newChatLabel?: string;
  closeLabel?: string;
  /** Any change scrolls the message list to the bottom (also on open). */
  scrollKey?: unknown;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8's "COO dock" — a fixed-width panel `AppFrame`'s `dock` slot floats
 * bottom-right over the main content. Collapsed it is only the bottom bar
 * (target chip + composer); focusing anything in the bar opens the 440px
 * conversation pane above it (header with NEW CHAT / CLOSE, scrolling messages).
 * Presentational only: transcript, composer and target chip are slots.
 */
export function ChatDock({
  open,
  defaultOpen = false,
  onOpenChange,
  transcript,
  composer,
  targetChip,
  onNewChat,
  newChatLabel = "New chat",
  closeLabel = "Close",
  scrollKey,
  ref,
}: ChatDockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const messagesRef = useRef<HTMLDivElement>(null);
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  // scrollKey is a trigger-only dependency.

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollKey, isOpen]);

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
            <div className="flex-1" />
            {onNewChat && (
              <Button
                data-testid={ChatDockTestId.NewChatButton}
                icon="plus"
                intent="primary"
                onClick={onNewChat}
                size="sm"
              >
                {newChatLabel}
              </Button>
            )}
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
            className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5"
            data-testid={ChatDockTestId.Messages}
            ref={messagesRef}
          >
            {transcript}
          </div>
        </div>
      )}

      <div
        className="flex flex-col p-2"
        data-testid={ChatDockTestId.Footer}
        onFocusCapture={() => {
          if (!isOpen) setOpen(true);
        }}
      >
        {targetChip && (
          <span className="pb-2" data-testid={ChatDockTestId.TargetChip}>
            {targetChip}
          </span>
        )}
        <div className="min-w-0" data-testid={ChatDockTestId.Composer}>
          {composer}
        </div>
      </div>
    </div>
  );
}
