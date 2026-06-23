import { useTranslations } from "next-intl";
import { Container, Stack, Typography } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType, ChatToolEvent } from "@zibby/contracts";
import { ChatMessage } from "./ChatMessage";

export enum ChatTranscriptTestId {
  Root = "chat-transcript",
  Empty = "chat-transcript-empty",
  LiveTurn = "chat-transcript-live-turn",
}

export interface ChatTranscriptProps {
  /** Persisted, append-only transcript turns (the source of truth). */
  messages: ChatMessageType[];
  /** Live assistant text accumulating from the SSE stream (pre-persist). */
  liveText?: string;
  /** Live tool-dispatch announcements for the in-progress turn. */
  liveToolEvents?: ChatToolEvent[];
  /** Whether the live assistant turn is still streaming tokens. */
  streaming?: boolean;
}

/**
 * The scrollable conversation. Renders the persisted turns, then — while a turn is
 * streaming — an extra live assistant bubble fed by the SSE deltas. On `done` the
 * transcript refetch replaces the live bubble with the persisted message (which
 * carries the authoritative text + toolEvents), so there's no duplicate.
 */
export function ChatTranscript({
  messages,
  liveText,
  liveToolEvents,
  streaming,
}: ChatTranscriptProps) {
  const t = useTranslations("chat");
  const hasLive = Boolean(streaming) && ((liveText ?? "").length > 0 || (liveToolEvents?.length ?? 0) > 0);
  const isEmpty = messages.length === 0 && !hasLive;

  if (isEmpty) {
    return (
      <Container data-testid={ChatTranscriptTestId.Empty} padding="200">
        <Typography type="note" variant="tertiary">
          {t("empty")}
        </Typography>
      </Container>
    );
  }

  return (
    <Stack data-testid={ChatTranscriptTestId.Root} direction="col" gap="200">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          role={message.role}
          text={message.text}
          toolEvents={message.toolEvents}
        />
      ))}

      {hasLive && (
        <Container data-testid={ChatTranscriptTestId.LiveTurn}>
          <ChatMessage
            role="assistant"
            streaming={streaming}
            text={liveText ?? ""}
            toolEvents={liveToolEvents}
          />
        </Container>
      )}
    </Stack>
  );
}
