"use client";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
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
  SidebarButton = "chat-dock-sidebar-button",
  Sidebar = "chat-dock-sidebar",
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
  /**
   * Left sidebar content (e.g. conversation history). When provided, the header
   * gets a toggle that widens the dock to fit it.
   */
  sidebar?: ReactNode;
  /** Controlled sidebar state — omit to let `ChatDock` manage it internally. */
  sidebarOpen?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
  sidebarLabel?: string;
  /** Any change scrolls the message list to the bottom (also on open). */
  scrollKey?: unknown;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8's chat dock — a fixed-width panel `AppFrame`'s `dock` slot floats
 * bottom-right over the main content. Collapsed it is only the bottom bar
 * (target chip + composer); focusing anything in the bar opens the conversation
 * pane above it, always at full size (header with NEW CHAT / CLOSE, scrolling
 * messages) — there is no small "mini chat" state.
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
  newChatLabel = "Clear",
  closeLabel = "Close",
  sidebar,
  sidebarOpen,
  onSidebarOpenChange,
  sidebarLabel = "History",
  scrollKey,
  ref,
}: ChatDockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const [internalSidebarOpen, setInternalSidebarOpen] = useState(false);
  const isSidebarOpen = sidebar != null && (sidebarOpen ?? internalSidebarOpen);
  const setSidebar = (next: boolean) => {
    setInternalSidebarOpen(next);
    onSidebarOpenChange?.(next);
  };
  const toggleSidebar = () => setSidebar(!isSidebarOpen);
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

  // Esc closes an open dock from anywhere. A nested control that consumes Esc
  // itself (the composer's mention picker) prevents default / stops propagation.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className={cn(
        "flex max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-xl border border-line-2 bg-panel shadow-modal",
        // Open: 33% of the AppFrame dock area (never under 420px), three quarters of its height
        // (pane basis 440px grows into the 75%), capped to the area. Closed: just the 420px bar.
        isOpen
          ? isSidebarOpen
            ? "max-h-full min-h-3/4 w-[max(660px,45%)]"
            : "max-h-full min-h-3/4 w-[max(420px,33%)]"
          : "w-[420px]",
        isOpen && isSidebarOpen && "flex-row",
      )}
      data-testid={ChatDockTestId.Root}
      ref={ref}
    >
      {isOpen && isSidebarOpen && (
        <div
          className="flex w-[240px] shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-line p-3.5"
          data-testid={ChatDockTestId.Sidebar}
        >
          {sidebar}
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isOpen && (
          <div
            className="flex min-h-0 grow basis-[440px] flex-col border-b border-line"
            data-testid={ChatDockTestId.Transcript}
          >
            <div
              className="flex items-center gap-2.5 border-b border-line px-3.5 py-3"
              data-testid={ChatDockTestId.Header}
            >
              {sidebar != null && (
                <Button
                  aria-label={sidebarLabel}
                  aria-pressed={isSidebarOpen}
                  data-testid={ChatDockTestId.SidebarButton}
                  icon="clock"
                  intent="ghost"
                  onClick={toggleSidebar}
                  size="sm"
                  title={sidebarLabel}
                />
              )}
              <div className="flex-1" />
              {onNewChat && (
                <Button
                  data-testid={ChatDockTestId.NewChatButton}
                  intent="primary"
                  onClick={onNewChat}
                  size="sm"
                >
                  {newChatLabel}
                </Button>
              )}
              <Button
                aria-label={closeLabel}
                data-testid={ChatDockTestId.CloseButton}
                icon="x"
                intent="secondary"
                onClick={() => setOpen(false)}
                size="sm"
                title={closeLabel}
              />
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
          // Focus opens it; so does a click into an already-focused input (after Esc).
          onFocusCapture={() => {
            if (!isOpen) setOpen(true);
          }}
          onPointerDownCapture={() => {
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
    </div>
  );
}
