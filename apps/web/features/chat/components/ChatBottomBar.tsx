"use client";

import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import {
  Container,
  GlassSurface,
  Icon,
  type IconName,
  Pressable,
  Stack,
  Tooltip,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { ChatDock } from "./ChatDock";
import { ChatQuickNote } from "./ChatQuickNote";
import { ChatQuickTask } from "./ChatQuickTask";

export enum ChatBottomBarTestId {
  Root = "chat-bottom-bar",
  ChatSlot = "chat-bottom-bar-chat-slot",
  TaskSlot = "chat-bottom-bar-task-slot",
  NoteSlot = "chat-bottom-bar-note-slot",
}

type BottomBarMode = "chat" | "task" | "note" | null;

export interface ChatBottomBarProps {
  /** Forwarded to {@link ChatDock} — see its own prop docs. */
  conversationId: string | null;
  messages: ChatMessageType[];
  onMessagesChange: Dispatch<SetStateAction<ChatMessageType[]>>;
  onNewChat: () => void;
  /** Mirrors the other floating chat widgets: dims, blurs and disables pointer
   *  events while an overlay (dialog/drawer) is up. */
  dimmed?: boolean;
  /** Forwarded to {@link ChatDock} — bridges its in-flight streaming state up to
   *  the host (drives `ChatScreen`'s orb-map pulse). */
  onStreamingChange?: (streaming: boolean) => void;
}

interface SlotSpec {
  id: Exclude<BottomBarMode, null>;
  /** Collapsed icon-button glyph — the design's own (`VD_BB_ITEMS`). The
   *  chat-bubble glyph was ported into the DS icon set for this bar; it used to
   *  fall back to the `bot` stand-in. */
  glyph: IconName;
  /** Expanded design width — mirrors `VD_BB_ITEMS` in `velin-d-bottombar.jsx`. */
  width: string;
  testId: ChatBottomBarTestId;
}

const SLOTS: SlotSpec[] = [
  { id: "task", glyph: "play", width: "400px", testId: ChatBottomBarTestId.TaskSlot },
  { id: "chat", glyph: "chat", width: "560px", testId: ChatBottomBarTestId.ChatSlot },
  { id: "note", glyph: "edit", width: "360px", testId: ChatBottomBarTestId.NoteSlot },
];

/**
 * Velín-D bottom-bar shell (`VcBottomBar`) — a bottom-centered row hosting the
 * three floating composers this branch already landed standalone: {@link ChatDock}
 * (chat), {@link ChatQuickTask} (run a task) and {@link ChatQuickNote} (add a
 * note). Slot model: one of `chat | task | note | null` is "active" — the active
 * slot renders its full component at its design width, the other slots collapse
 * to ~48px circular glass icon buttons that switch the active slot on click.
 * Chat is active by default (operator decision); each hosted component's own
 * close affordance collapses the bar to all-icons (`mode = null`).
 *
 * Position-agnostic, like the components it hosts: `ChatScreen` owns the screen
 * coordinates (design `left:50% bottom:26 translateX(-50%)`); this component owns
 * only the slot row itself.
 */
export function ChatBottomBar({
  conversationId,
  messages,
  onMessagesChange,
  onNewChat,
  dimmed = false,
  onStreamingChange,
}: ChatBottomBarProps) {
  const t = useTranslations("chat.bottomBar");
  const [mode, setMode] = useState<BottomBarMode>("chat");

  const collapse = () => setMode(null);

  return (
    <Container
      data-testid={ChatBottomBarTestId.Root}
      pointerEvents={dimmed ? "none" : "auto"}
      style={{
        opacity: dimmed ? 0.28 : 1,
        filter: dimmed ? "blur(2px)" : "none",
        transition: "opacity .4s ease, filter .4s ease",
      }}
    >
      {/* gap 10 — the design's `VcBottomBar` (`gap: 10, alignItems: flex-end`). */}
      <Stack align="end" direction="row" gap="125">
        {SLOTS.map((slot) => {
          const active = mode === slot.id;
          const label = t(slot.id);
          return (
            <Container
              key={slot.id}
              shrink={false}
              style={{ transition: "width .38s cubic-bezier(.2,.8,.2,1)" }}
              width={active ? slot.width : "48px"}
            >
              {active ? (
                slot.id === "chat" ? (
                  <ChatDock
                    conversationId={conversationId}
                    messages={messages}
                    onClose={collapse}
                    onMessagesChange={onMessagesChange}
                    onNewChat={onNewChat}
                    onStreamingChange={onStreamingChange}
                  />
                ) : slot.id === "task" ? (
                  <ChatQuickTask onClose={collapse} />
                ) : (
                  <ChatQuickNote onClose={collapse} />
                )
              ) : (
                <Tooltip content={label}>
                  <Pressable
                    aria-label={label}
                    data-testid={slot.testId}
                    onClick={() => setMode(slot.id)}
                    title={label}
                  >
                    <GlassSurface
                      radius="pill"
                      style={{
                        alignItems: "center",
                        color: "var(--color-foreground-dim)",
                        display: "flex",
                        height: "48px",
                        justifyContent: "center",
                        transition: "color .18s ease",
                        width: "48px",
                      }}
                    >
                      <Icon name={slot.glyph} size="lg" />
                    </GlassSurface>
                  </Pressable>
                </Tooltip>
              )}
            </Container>
          );
        })}
      </Stack>
    </Container>
  );
}
