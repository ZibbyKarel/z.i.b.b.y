import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, Container, Icon, Stack, StatusDot, Typography } from "@zibby/design-system";
import type { DotTone } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType, ChatToolEvent } from "@zibby/contracts";
import { MarkdownProse } from "../../../components/MarkdownProse/MarkdownProse";

export enum ChatMessageTestId {
  Root = "chat-message",
  UserBubble = "chat-message-user",
  AssistantBubble = "chat-message-assistant",
  Text = "chat-message-text",
  ToolEvent = "chat-message-tool-event",
  ToolEventLink = "chat-message-tool-event-link",
  StreamingCursor = "chat-message-streaming-cursor",
}

export interface ChatMessageProps {
  role: ChatMessageType["role"];
  text: string;
  toolEvents?: ChatToolEvent[];
  /** Marks the assistant turn that is still streaming (shows a live cursor). */
  streaming?: boolean;
}

/** Map a tool event status onto the DS StatusDot tone. */
function toolTone(status: ChatToolEvent["status"]): DotTone {
  if (status === "error") return "bad";
  if (status === "ok") return "ok";
  return "run";
}

function ToolEventRow({ event }: { event: ChatToolEvent }) {
  const summary = event.summary ?? event.name;
  const body = (
    <Stack align="center" data-testid={ChatMessageTestId.ToolEvent} direction="row" gap="75">
      <StatusDot pulse={event.status === "started"} tone={toolTone(event.status)} />
      <Typography mono size="xs" type="note" variant="secondary">
        {summary}
      </Typography>
      {event.href && <Icon name="chevron" size="sm" tone="faint" />}
    </Stack>
  );

  if (!event.href) return body;
  return (
    <Link
      data-testid={ChatMessageTestId.ToolEventLink}
      href={event.href}
      style={{ display: "block", textDecoration: "none" }}
    >
      {body}
    </Link>
  );
}

/**
 * One transcript message. User turns sit to the right in a filled bubble;
 * assistant turns sit to the left, render their (possibly streaming) text and any
 * inline tool-dispatch announcements with a link into the app. While `streaming`,
 * a trailing cursor signals tokens are still arriving.
 */
export function ChatMessage({ role, text, toolEvents, streaming }: ChatMessageProps) {
  const t = useTranslations("chat");
  const isUser = role === "user";

  return (
    <Stack
      align={isUser ? "end" : "start"}
      data-testid={ChatMessageTestId.Root}
      direction="col"
      gap="75"
    >
      <Card
        background={isUser ? "raised" : "surface"}
        data-testid={isUser ? ChatMessageTestId.UserBubble : ChatMessageTestId.AssistantBubble}
        radius="lg"
      >
        <Container maxWidth="68ch" padding={["100", "150"]}>
          {isUser ? (
            // The operator's own turn is plain text — render it verbatim.
            <Typography data-testid={ChatMessageTestId.Text} type="text">
              {text}
            </Typography>
          ) : (
            // ZIBBY's turn is GitHub-flavoured markdown — format it. The live cursor
            // is a sibling, never part of the markdown string (so a half-typed `**`
            // can't break the parse).
            <>
              <MarkdownProse text={text} />
              {streaming && (
                <Typography
                  aria-label={t("streaming")}
                  as="span"
                  data-testid={ChatMessageTestId.StreamingCursor}
                  type="text"
                  variant="tertiary"
                >
                  {" █"}
                </Typography>
              )}
            </>
          )}
        </Container>
      </Card>

      {toolEvents && toolEvents.length > 0 && (
        <Stack direction="col" gap="50">
          {toolEvents.map((event, i) => (
            <ToolEventRow event={event} key={`${event.name}-${i}`} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
