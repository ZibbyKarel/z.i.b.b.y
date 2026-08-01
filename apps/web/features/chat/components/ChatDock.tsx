"use client";

import type { Dispatch, FocusEvent, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage as ChatMessageType, TaskTarget } from "@zibby/contracts";
import { Button, Container, GlassSurface, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { useVoiceMode } from "../hooks/useVoiceMode";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { ChatTranscript } from "./ChatTranscript";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

export enum ChatDockTestId {
  Root = "chat-dock",
  History = "chat-dock-history",
  Composer = "chat-dock-composer",
  Send = "chat-dock-send",
  NewChat = "chat-dock-new-chat",
  Close = "chat-dock-close",
}

export interface ChatDockProps {
  /**
   * The conversation this dock owns. Mirrors {@link ChatScreenProps}
   * ("`components/ChatScreen.tsx`") — minted once by `ChatProvider` and preserved
   * across mount/unmount; only "New chat" mints a fresh one.
   */
  conversationId: string | null;
  /** The transcript, owned by `ChatProvider` so it survives this component unmounting. */
  messages: ChatMessageType[];
  /** Append/replace transcript turns (lifted setter from the provider). */
  onMessagesChange: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation. */
  onNewChat: () => void;
  /** A host that can collapse this dock (e.g. back to a pill) renders a close
   *  affordance when this is supplied. Omit for no close control. */
  onClose?: () => void;
  /** Mirrors the other floating chat widgets: dims, blurs and disables pointer
   *  events while an overlay (dialog/drawer) is up. */
  dimmed?: boolean;
  /** Bridges the dock's in-flight "thinking" state up to the host: after this
   *  dock owns the ONLY chat stream, `ChatScreen` keeps no `useChatStream` of its
   *  own, so the orb-map pulse is driven from here. Fired whenever `thinking`
   *  flips; the effect's cleanup fires `false` so unmounting the dock (the bar
   *  switches away from chat, or collapses) clears the pulse rather than freezing
   *  it lit. */
  onStreamingChange?: (streaming: boolean) => void;
}

/** Collapsed history max-height — grows while the composer has focus. */
const HISTORY_COLLAPSED_MAX_HEIGHT = "128px";
const HISTORY_FOCUSED_MAX_HEIGHT = "min(50vh, 460px)";

/** Composer auto-grows up to this many lines, then scrolls. Change here to retune. */
const CHAT_COMPOSER_MAX_ROWS = 4;

/**
 * The Velín-D bottom-bar chat dock (`VcChatDock`) — a self-contained
 * {@link GlassSurface} whose conversation history fades up (mask) with a fixed
 * composer pinned at the bottom. This is `ChatScreen`'s transcript + composer,
 * repackaged into the glass dock using the SAME hooks (`useChatStream`,
 * `useSendChatMessageMutation`, `useVoiceMode`) so a later phase can delete
 * `ChatScreen`'s own copy and mount this instead — see `ChatScreen.tsx` for the
 * screen this was extracted from.
 *
 * Deliberately narrower than `ChatScreen`: it does NOT reuse `useAutoSpeak`
 * (spoken replies) or the turn-taking pause latch that orchestrates it —
 * `useVoiceMode` is wired here only for hands-free DICTATION (a finalized
 * utterance is sent as a chat message), with the mic simply disarmed while a
 * turn is in flight (`thinking`). Spoken replies stay `ChatScreen`'s concern
 * until a later phase folds that in too.
 *
 * Standalone unit: owns its own hooks, no prop-drill, not yet mounted anywhere
 * (the bottom bar mounts it in a later phase).
 */
export function ChatDock({
  conversationId,
  messages,
  onMessagesChange,
  onNewChat,
  onClose,
  dimmed = false,
  onStreamingChange,
}: ChatDockProps) {
  const t = useTranslations("chat");
  const setMessages = onMessagesChange;
  const sendMessage = useSendChatMessageMutation();

  const appendAssistant = useCallback(
    ({ turnId, text, toolEvents }: CompletedTurn) => {
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
    },
    [setMessages],
  );

  const appendError = useCallback(
    (message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${crypto.randomUUID()}`,
          role: "assistant",
          text: message,
          at: new Date().toISOString(),
        },
      ]);
    },
    [setMessages],
  );

  const stream = useChatStream(conversationId, {
    onComplete: appendAssistant,
    onError: appendError,
  });

  // A turn is in flight from send (`isPending`) through the streamed reply until
  // the terminal `done`/`error` — mirrors `ChatScreen`'s own derivation.
  const thinking = sendMessage.isPending || stream.streaming;

  // Bridge the in-flight state up to the host (`ChatScreen`'s orb-map pulse) —
  // this dock is the single stream owner now, so the pulse can't be derived on
  // the screen. Cleanup fires `false` so unmounting the dock clears the pulse
  // instead of leaving it lit.
  useEffect(() => {
    onStreamingChange?.(thinking);
    return () => onStreamingChange?.(false);
  }, [thinking, onStreamingChange]);

  const send = useCallback(
    (text: string, target?: TaskTarget) => {
      if (!conversationId) return;
      setMessages((prev) => [
        ...prev,
        { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
      ]);
      sendMessage.mutate({ body: { conversationId, text, ...(target ? { target } : {}) } });
    },
    [conversationId, setMessages, sendMessage],
  );

  // Hands-free dictation (Phase 119a) — a finalized utterance is sent verbatim,
  // bypassing the composer. The mic is disarmed only while a turn is in flight;
  // this dock doesn't orchestrate spoken replies (see the doc comment above), so
  // there's no `speaking`/`paused` gate to fold in here.
  const voice = useVoiceMode({ onSend: send, suspended: thinking });

  // Stick-to-bottom auto-scroll (mirrors the design's `VcChatDock`): a new turn
  // scrolls the history into view UNLESS the operator scrolled up to read back —
  // `stickToBottom` tracks that via the history's own scroll position.
  const historyRef = useRef<HTMLElement>(null);
  const stickToBottom = useRef(true);
  const [composerFocused, setComposerFocused] = useState(false);

  const handleHistoryScroll = useCallback(() => {
    const el = historyRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  useEffect(() => {
    const el = historyRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream.text, stream.toolEvents.length, composerFocused]);

  // Focus-within the composer row (bubbles up from CommandLine's own input, the
  // attach/mic/send buttons and New chat) grows the history panel and lights the
  // dock's border — mirrors the design's textarea-driven `focused` state, widened
  // to the whole composer row since `CommandLine`'s internal input isn't reachable
  // from here (its internals aren't ours to edit — see the task brief).
  const handleComposerFocus = useCallback(() => setComposerFocused(true), []);
  const handleComposerBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setComposerFocused(false);
    }
  }, []);

  return (
    <Container
      data-testid={ChatDockTestId.Root}
      pointerEvents={dimmed ? "none" : "auto"}
      style={{
        opacity: dimmed ? 0.3 : 1,
        filter: dimmed ? "blur(2.5px)" : "none",
        transition: "opacity .4s ease, filter .4s ease",
      }}
    >
      <GlassSurface
        radius="panel"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "26px",
          transition: "border-color .25s, box-shadow .3s",
          ...(composerFocused
            ? {
                // `border` shorthand (not `borderColor` longhand): GlassSurface
                // already sets `border: 1px solid …` inline, so overriding the
                // longhand here mixed shorthand+longhand on one node — React warned
                // ("removing borderColor … border") on focus toggle and when the
                // bottom bar reuses this GlassSurface node across a slot swap.
                border: "1px solid var(--color-accent)",
                boxShadow: "0 0 0 1px var(--color-accent-glow), var(--shadow-glass)",
              }
            : {}),
        }}
      >
        {onClose && (
          <Container position="absolute" right="10px" top="10px" zIndex={5}>
            <Button
              aria-label={t("close")}
              data-testid={ChatDockTestId.Close}
              icon="x"
              intent="ghost"
              onClick={onClose}
              size="sm"
              title={t("close")}
            />
          </Container>
        )}

        {messages.length > 0 && (
          <Container bottom="58px" position="absolute" right="10px" zIndex={5}>
            <Button
              aria-label={t("newChat")}
              data-testid={ChatDockTestId.NewChat}
              icon="trash"
              intent="ghost"
              onClick={onNewChat}
              size="sm"
              title={t("newChat")}
            />
          </Container>
        )}

        <Container
          data-testid={ChatDockTestId.History}
          maxHeight={composerFocused ? HISTORY_FOCUSED_MAX_HEIGHT : HISTORY_COLLAPSED_MAX_HEIGHT}
          onScroll={handleHistoryScroll}
          overflowX="hidden"
          overflowY="auto"
          padding="150"
          ref={historyRef}
          style={{
            display: "flex",
            flexDirection: "column",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 20px)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 20px)",
            transition: "max-height .38s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <ChatTranscript
            liveText={stream.text}
            liveToolEvents={stream.toolEvents}
            messages={messages}
            streaming={stream.streaming}
          />
        </Container>

        <Container
          data-testid={ChatDockTestId.Composer}
          onBlur={handleComposerBlur}
          onFocus={handleComposerFocus}
          padding="150"
          style={{
            borderTop: composerFocused
              ? "1px solid var(--color-accent-glow)"
              : "1px solid var(--color-glass-border)",
            transition: "border-color .25s",
          }}
        >
          <Stack align="stretch" direction="col" gap="100">
            {voice.active && (
              <VoiceStatusStrip interim={voice.interim} listening={voice.listening} />
            )}
            {/* The design's composer row is chrome-less: no caption above it and no
                field box around it — the dock's own glass surface (and its focus
                border-top above) is the frame. */}
            <CommandLine
              frameless
              hideLabel
              showAttach
              attachIcon="paperclip"
              chrome={false}
              disabled={thinking}
              label={t("composer.label")}
              leadingActions={
                voice.supported && (
                  <VoiceToggleButton active={voice.active} onToggle={voice.toggle} />
                )
              }
              maxRows={CHAT_COMPOSER_MAX_ROWS}
              onSubmit={send}
              placeholder={t("composer.placeholder")}
              renderTrailing={({ canSubmit, submit }) => (
                <Button
                  aria-label={t("composer.send")}
                  data-testid={ChatDockTestId.Send}
                  disabled={!canSubmit}
                  icon="arrow"
                  intent="primary"
                  onClick={submit}
                  size="sm"
                />
              )}
            />
          </Stack>
        </Container>
      </GlassSurface>
    </Container>
  );
}
