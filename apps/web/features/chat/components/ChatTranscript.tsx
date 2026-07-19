import { Stack } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType, ChatToolEvent } from "@zibby/contracts";
import { ChatMessage } from "./ChatMessage";

export enum ChatTranscriptTestId {
  Root = "chat-transcript",
  LiveTurn = "chat-transcript-live-turn",
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
}: ChatTranscriptProps) {
  const hasLive =
    Boolean(streaming) && ((liveText ?? "").length > 0 || (liveToolEvents?.length ?? 0) > 0);

  if (messages.length === 0 && !hasLive) return null;

  return (
    <Stack data-testid={ChatTranscriptTestId.Root} direction="col" gap="200">
      {messages.map((message) => (
        <ChatMessage
          briefing={message.briefing}
          key={message.id}
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
    </Stack>
  );
}
