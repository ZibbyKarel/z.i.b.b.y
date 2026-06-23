/* eslint-disable react/forbid-dom-props -- A bespoke full-screen HUD takeover
   (like the old Voice UI): radial backdrop, scanline/grid overlays, the ambient
   orb behind the conversation and the transcript's top fade-mask are decorative
   inline styles with no DS prop equivalent — sanctioned escape hatch, file-level. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Container, Icon, Stack, Typography } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { useNow } from "../../../hooks/useNow";
import { MINUTE_MS } from "../../../utils/time";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { ChatComposer } from "./ChatComposer";
import { ChatOrb } from "./ChatOrb";
import { ChatTranscript } from "./ChatTranscript";

const ACCENT = "var(--color-accent)";

export enum ChatScreenTestId {
  Root = "chat-screen",
  ScrollArea = "chat-screen-scroll",
  Greeting = "chat-screen-greeting",
  Close = "chat-screen-close",
}

export interface ChatScreenProps {
  /**
   * The conversation this overlay session owns. Minted fresh by {@link ChatProvider}
   * on each open, so closing + reopening starts a clean thread (no `--resume`).
   */
  conversationId: string | null;
  /** Close the overlay (Esc / header close). */
  onClose: () => void;
}

/**
 * The chat-first conversational overlay — a JARVIS-style full-screen takeover with
 * a radial backdrop, an ambient {@link ChatOrb} behind the conversation, a
 * scrollable transcript that fades into nothing at the top (scroll up to read back
 * to the start), and the text composer pinned at the bottom.
 *
 * The conversation lives entirely in this component's client state for the overlay
 * session: the operator's turn is appended optimistically on send, and the
 * assistant's turn is appended from the stream's `done` (authoritative text +
 * accumulated tool events). The backend still writes every message to the JSONL
 * transcript — the UI just renders what the stream produced rather than refetching,
 * which is what removed the "history disappears after a reply" flash. Closing the
 * overlay unmounts this component (state gone) and the next open mints a new
 * conversation, so reopening is a clean reset.
 */
export function ChatScreen({ conversationId, onClose }: ChatScreenProps) {
  const t = useTranslations("chat");
  const now = useNow(MINUTE_MS);

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const sendMessage = useSendChatMessageMutation();

  const appendAssistant = useCallback(({ turnId, text, toolEvents }: CompletedTurn) => {
    if (!text && toolEvents.length === 0) return;
    setMessages((prev) => [
      ...prev,
      {
        id: turnId,
        role: "assistant",
        text,
        at: new Date().toISOString(),
        ...(toolEvents.length > 0 ? { toolEvents } : {}),
      },
    ]);
  }, []);

  const appendError = useCallback((message: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `err-${crypto.randomUUID()}`, role: "assistant", text: message, at: new Date().toISOString() },
    ]);
  }, []);

  const stream = useChatStream(conversationId, { onComplete: appendAssistant, onError: appendError });

  const send = (text: string) => {
    if (!conversationId) return;
    setMessages((prev) => [
      ...prev,
      { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
    ]);
    sendMessage.mutate({ body: { conversationId, text } });
  };

  // Keep the latest turn in view as messages land and tokens stream in.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream.text, stream.toolEvents.length]);

  // Esc closes the overlay.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const thinking = sendMessage.isPending || stream.streaming;
  const isEmpty = messages.length === 0 && !stream.streaming;

  const time = new Date(now);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      aria-label={t("title")}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden font-sans"
      data-testid={ChatScreenTestId.Root}
      role="dialog"
      style={{
        background:
          "radial-gradient(ellipse 100% 85% at 50% 48%, #0b1422 0%, var(--color-background) 62%)",
        animation: "v-mode-in 0.42s cubic-bezier(.22,.68,0,1.2)",
      }}
    >
      {/* Scanlines + grid overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(255,255,255,0.011) 0px,rgba(255,255,255,0.011) 1px,transparent 1px,transparent 5px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%,#000 10%,transparent 80%)",
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-border px-[22px] py-[13px]">
        <Stack align="center" direction="row" gap="100">
          <Icon name="butlerSign" size="md" tone="accent" />
          <Typography mono size="sm" tone="accent" tracking="widest" type="note">
            {t("modeLabel")}
          </Typography>
          <span
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full transition-all"
            style={{
              background: thinking ? "var(--color-ok)" : ACCENT,
              boxShadow: `0 0 8px ${thinking ? "var(--color-ok)" : ACCENT}`,
            }}
          />
        </Stack>

        <Typography mono size="md" type="subtitle" weight="semibold">
          {timeStr}
        </Typography>

        <button
          className="flex cursor-pointer items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
          data-testid={ChatScreenTestId.Close}
          onClick={onClose}
          type="button"
        >
          <Icon name="grid" size="xs" />
          {t("close")}
        </button>
      </div>

      {/* ── Main area: orb behind, scrollable conversation over it ───── */}
      <div className="relative z-10 flex min-h-0 flex-1 justify-center">
        {/* Ambient orb — centered, behind the conversation, dimmed so text reads. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ opacity: isEmpty ? 0.85 : 0.32, transition: "opacity 0.6s" }}
        >
          <ChatOrb thinking={thinking} />
        </div>

        <div
          className="relative z-10 w-full max-w-[720px] overflow-y-auto px-5 py-8"
          data-testid={ChatScreenTestId.ScrollArea}
          ref={scrollRef}
          style={{
            // Fade the top edge: older turns dissolve as they scroll up, but the
            // area still scrolls all the way back to the start of the conversation.
            maskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 100%)",
          }}
        >
          {isEmpty ? (
            <Container data-testid={ChatScreenTestId.Greeting}>
              <Stack align="center" gap="100">
                <Typography align="center" tone="accent" type="subtitle" weight="medium">
                  {t("greetingTitle")}
                </Typography>
                <Typography align="center" type="note" variant="tertiary">
                  {t("greetingHint")}
                </Typography>
              </Stack>
            </Container>
          ) : (
            <ChatTranscript
              liveText={stream.text}
              liveToolEvents={stream.toolEvents}
              messages={messages}
              streaming={stream.streaming}
            />
          )}
        </div>
      </div>

      {/* ── Composer ────────────────────────────────────────────────── */}
      <div className="relative z-20 shrink-0 border-t border-border px-5 py-4">
        <div className="mx-auto max-w-[720px]">
          <ChatComposer disabled={thinking} onSend={send} />
        </div>
      </div>
    </div>
  );
}
