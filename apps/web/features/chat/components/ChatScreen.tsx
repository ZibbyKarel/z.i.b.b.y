import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Container, Dialog, Stack } from "@zibby/design-system";
import { useChatTranscriptQuery } from "../queries/useChatTranscriptQuery";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { useChatStream } from "../hooks/useChatStream";
import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export enum ChatScreenTestId {
  Root = "chat-screen",
  ScrollArea = "chat-screen-scroll",
}

export interface ChatScreenProps {
  /** Close the overlay (Esc / overlay click / header close). */
  onClose: () => void;
}

/**
 * The chat-first conversational overlay: a fullscreen DS Dialog with a scrollable
 * transcript and the text composer pinned at the bottom.
 *
 * Data flow (the load-bearing sequencing):
 *   1. The transcript query (no explicit id) bootstraps the always-present
 *      `conversationId` — the contract guarantees it's non-optional.
 *   2. Once that id is known, `useChatStream` opens the SSE token stream for it.
 *   3. Sending passes the known id in the body, so a second turn never mints a new
 *      conversation. The mutation does NOT refetch the transcript — the assistant
 *      reply streams in afterward and the `done` event drives the refetch.
 */
export function ChatScreen({ onClose }: ChatScreenProps) {
  const t = useTranslations("chat");
  const { data: transcript } = useChatTranscriptQuery();
  const conversationId = transcript?.conversationId ?? null;
  const messages = transcript?.messages ?? [];

  const sendMessage = useSendChatMessageMutation();
  const stream = useChatStream(conversationId);

  const send = (text: string) => {
    sendMessage.mutate({
      body: conversationId ? { conversationId, text } : { text },
    });
  };

  // Keep the latest turn in view as messages land and tokens stream in.
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream.text, stream.toolEvents.length]);

  // A turn is "in flight" from send until the stream reports done/error.
  const inFlight = sendMessage.isPending || stream.streaming;

  return (
    <Dialog open ariaLabel={t("title")} onClose={onClose} title={t("title")} width="full">
      <Stack
        grow
        data-testid={ChatScreenTestId.Root}
        direction="col"
        gap="200"
        style={{ minHeight: 0 }}
      >
        <Container
          grow
          data-testid={ChatScreenTestId.ScrollArea}
          overflow="auto"
          padding={["100", "0"]}
          ref={scrollRef}
        >
          <ChatTranscript
            liveText={stream.text}
            liveToolEvents={stream.toolEvents}
            messages={messages}
            streaming={stream.streaming}
          />
        </Container>

        <ChatComposer disabled={inFlight} onSend={send} />
      </Stack>
    </Dialog>
  );
}
