"use client";

import type { TaskTarget } from "@zibby/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "../ChatContext";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { useChatTranscriptQuery } from "../queries/useChatTranscriptQuery";
import { useAnyAudioPlaying } from "./useAudioPlayback";
import { type ChatStreamState, type CompletedTurn, useChatStream } from "./useChatStream";
import { type VoiceMode, useVoiceMode } from "./useVoiceMode";

export interface CooChat {
  /** The live SSE stream for the in-flight assistant turn. */
  stream: ChatStreamState;
  /** A turn is in flight: from send (`isPending`) through the terminal `done`/`error`. */
  thinking: boolean;
  /**
   * Send one operator turn. `target` is the composer's per-turn `@`-mention;
   * when absent the dock's explicit scope (`dockTarget`, O-20) applies; when both
   * are absent the COO's classifier routes. Either way an explicit target is sent
   * as `target` — "explicit target overrides the classifier".
   */
  send: (text: string, target?: TaskTarget) => void;
  /** The team tagged via the composer's `@`-mention (Task 8) — a KB scope, not a target. */
  setTeamId: (teamId: string | undefined) => void;
  /** Hands-free dictation over `useSpeechRecognition` (O-22). */
  voice: VoiceMode;
}

/**
 * The COO dock's chat engine (ZB-12) — the one owner of the conversation stream
 * app-wide. It reuses the engine the retired `/chat` page ran on unchanged
 * (`useChatStream` over `GET /api/chat/stream`, `useSendChatMessageMutation`,
 * the `claude --resume` conversation id from {@link ChatProvider}), so mounting
 * it exactly once — in the shell's dock — keeps a single EventSource.
 *
 * Also owns the reload hydration the `/chat` screen used to do: on a full page
 * reload the provider's in-memory transcript is gone, so the durable copy
 * (`GET /api/chat/transcript`, queried with no `conversationId` — always the
 * server's one active thread, never whatever `ChatContext` currently holds;
 * see the query call below) is read back once per mount. The `hydratedFor`
 * ref makes the seed one-shot so it never clobbers live or optimistic turns
 * already in state.
 *
 * Voice (O-22): dictation only — a finalized utterance is sent verbatim. The mic
 * is disarmed while a turn is in flight (idle gating) and while any reply is
 * being read aloud (echo guard: the mic must never transcribe ZIBBY's own voice).
 */
export function useCooChat(): CooChat {
  const { conversationId, ensureConversation, setConversationId, setMessages, dockTarget } =
    useChat();

  // Deliberately NOT `conversationId ?? undefined`: `ChatContext`'s `open()`/⌘J
  // handler mints a conversation id client-side, synchronously, the moment the
  // dock is toggled — which can (and does, reliably under Playwright's fast
  // synthetic input) race ahead of this query's own network round trip. Once
  // the query key stopped being `undefined`, the fetch it's keyed on stops
  // resolving the server's *active* thread and starts asking for that specific
  // (possibly brand new, empty) id instead — silently losing whatever the
  // active thread actually had (e.g. a briefing an overnight automation just
  // appended). Querying with `undefined` unconditionally sidesteps the race
  // entirely: every mount resolves the server's one authoritative active
  // thread (this is a single-thread MVP — `ChatTranscriptStore`'s own
  // docblock), and the hydration effect below then adopts whatever id comes
  // back, overwriting any client-minted placeholder.
  const transcriptQuery = useChatTranscriptQuery(undefined);
  const transcript = transcriptQuery.data;

  // Once hydration has settled without producing a thread (no active thread on
  // the server yet, or the read failed), mint one locally — otherwise a turn
  // typed into the always-visible dock composer before anyone pressed ⌘J would
  // hit `send`'s `!conversationId` guard and be dropped silently. Minting only
  // AFTER the query settles keeps the race described above closed.
  const hydrationSettled = transcriptQuery.isSuccess || transcriptQuery.isError;
  useEffect(() => {
    if (hydrationSettled && !transcript) ensureConversation();
  }, [hydrationSettled, transcript, ensureConversation]);
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!transcript) return;
    if (hydratedFor.current === transcript.conversationId) return;
    hydratedFor.current = transcript.conversationId;
    setConversationId(transcript.conversationId);
    setMessages(transcript.messages);
  }, [transcript, setConversationId, setMessages]);

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

  const sendMessage = useSendChatMessageMutation();
  const thinking = sendMessage.isPending || stream.streaming;

  // The team tag is not part of `CommandLine.onSubmit`'s signature, so it rides
  // in its own state; `CommandLine` clears it after submit (resetOnSubmit), so a
  // team tagged on one turn doesn't leak onto the next.
  const [teamId, setTeamId] = useState<string | undefined>(undefined);

  const send = useCallback(
    (text: string, target?: TaskTarget) => {
      if (!conversationId) return;
      const effectiveTarget = target ?? dockTarget ?? undefined;
      setMessages((prev) => [
        ...prev,
        { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
      ]);
      sendMessage.mutate({
        body: {
          conversationId,
          text,
          ...(effectiveTarget ? { target: effectiveTarget } : {}),
          ...(teamId ? { teamId } : {}),
        },
      });
    },
    [conversationId, dockTarget, setMessages, sendMessage, teamId],
  );

  const speaking = useAnyAudioPlaying();
  const sendDictated = useCallback((text: string) => send(text), [send]);
  const voice = useVoiceMode({ onSend: sendDictated, suspended: thinking || speaking });

  return { stream, thinking, send, setTeamId, voice };
}
