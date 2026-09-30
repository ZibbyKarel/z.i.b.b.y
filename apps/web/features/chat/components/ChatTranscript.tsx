import { useTranslations } from "next-intl";
import { Card, Container, Stack, TypingDots } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType, ChatToolEvent } from "@zibby/contracts";
import { ChatMessage } from "./ChatMessage";

export enum ChatTranscriptTestId {
  Root = "chat-transcript",
  LiveTurn = "chat-transcript-live-turn",
  ThinkingTurn = "chat-transcript-thinking-turn",
}

export interface ChatTranscriptProps {
  /** The conversation so far, oldest first (held in the overlay's client state). */
  messages: ChatMessageType[];
  /** Live assistant text accumulating from the SSE stream (pre-commit). */
  liveText?: string;
  /** Live tool-dispatch announcements for the in-progress turn. */
  liveToolEvents?: ChatToolEvent[];
  /** Whether the live assistant turn is still streaming tokens. */
  streaming?: boolean;
  /** A turn is in flight (from send through the terminal done/error) — drives
   *  the {@link TypingDots} placeholder for the gap before any token or tool
   *  event has arrived yet (ZB-12b). */
  thinking?: boolean;
  /** ZB-12 — forwarded to each settled assistant turn's "CREATE TASK" action. */
  onCreateTask?: (text: string) => void;
}

/**
 * The conversation column. Renders the committed turns oldest-first, then — while a
 * turn is streaming — an extra live assistant bubble fed by the SSE deltas. On
 * `done` the stream hook hands the finished turn to the overlay (which appends it
 * to `messages`) and resets the live buffer in the same update, so the live bubble
 * gives way to the committed message with no flash and no duplicate.
 */
export function ChatTranscript({
  messages,
  liveText,
  liveToolEvents,
  streaming,
  thinking,
  onCreateTask,
}: ChatTranscriptProps) {
  const t = useTranslations("chat");
  const hasLive =
    Boolean(streaming) && ((liveText ?? "").length > 0 || (liveToolEvents?.length ?? 0) > 0);
  // The gap between send and the first token/tool event — `thinking` is already
  // true here, but there's nothing to render as the live turn yet.
  const isThinking = Boolean(thinking) && !hasLive;

  if (messages.length === 0 && !hasLive && !isThinking) return null;

  return (
    <Stack data-testid={ChatTranscriptTestId.Root} direction="col" gap="200">
      {messages.map((message) => (
        <ChatMessage
          attachments={message.attachments}
          briefing={message.briefing}
          key={message.id}
          mentions={message.mentions}
          onCreateTask={onCreateTask}
          role={message.role}
          text={message.text}
          toolEvents={message.toolEvents}
        />
      ))}

      {hasLive && (
        <div data-testid={ChatTranscriptTestId.LiveTurn}>
          <ChatMessage
            role="assistant"
            streaming={streaming}
            text={liveText ?? ""}
            toolEvents={liveToolEvents}
          />
        </div>
      )}

      {isThinking && (
        <Stack
          align="start"
          data-testid={ChatTranscriptTestId.ThinkingTurn}
          direction="col"
          gap="75"
        >
          <Card background="raised" radius="lg">
            <Container padding={["100", "150"]}>
              <TypingDots label={t("streaming")} />
            </Container>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
