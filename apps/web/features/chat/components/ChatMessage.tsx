import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, Container, Icon, IconTile, Stack, StatusDot, Typography } from "@zibby/design-system";
import type { DotTone, IconName } from "@zibby/design-system";
import type { ChatMessage as ChatMessageType, ChatToolEvent, TaskTarget } from "@zibby/contracts";
import { MarkdownProse } from "../../../components/MarkdownProse/MarkdownProse";
import { ChatRunCard } from "./ChatRunCard";

export enum ChatMessageTestId {
  Root = "chat-message",
  UserBubble = "chat-message-user",
  AssistantBubble = "chat-message-assistant",
  Text = "chat-message-text",
  AssistantIdentity = "chat-message-assistant-identity",
  ToolEvent = "chat-message-tool-event",
  ToolEventLink = "chat-message-tool-event-link",
  ToolEventTarget = "chat-message-tool-event-target",
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

/** The orchestrator has no `glyph` in its display shape today — fall back to its
 * compass; a stored agent/pipeline/goal/chain target falls back to a generic bot.
 * Exported so {@link ChatRunCard} (Fáze 14.3) can render the same identity chip
 * in its collapsed header without a second lookup implementation. */
export function targetGlyph(target: TaskTarget): IconName {
  if (target.kind === "orchestrator") return "compass";
  return (target.glyph as IconName | undefined) ?? "bot";
}

/**
 * The dispatch identity for a tool event — a small `IconTile` chip naming the
 * routing target (Fáze 14.2, Rozhodnutí 4). Accepts an array so a future
 * `orchestrátor → sub-agent` chain (once a run's sub-agent is known) is just
 * another entry — today every event carries at most one target. Exported so
 * `ChatRunCard` (Fáze 14.3) reuses this exact chip render for its own header
 * instead of a parallel implementation (Rozhodnutí 4/5).
 */
export function TargetIdentity({ targets }: { targets: TaskTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <Stack wrap align="center" data-testid={ChatMessageTestId.ToolEventTarget} direction="row" gap="50">
      {targets.map((target, i) => (
        <Stack align="center" direction="row" gap="50" key={`${target.kind}-${i}`}>
          {i > 0 && <Icon name="chevron" size="xs" tone="faint" />}
          <IconTile glyph={targetGlyph(target)} size="sm" tone="accent" />
          <Typography mono size="xs" tone="accent" type="note">
            {target.name}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ToolEventRow({ event }: { event: ChatToolEvent }) {
  // A dispatch that has produced a run (`runRef` known — the `ok` phase of the
  // two-phase create_task event, Fáze 14.2) renders the live run card instead of
  // the flat announcement row (Fáze 14.3, Rozhodnutí 5). The `started` phase has
  // no `runRef` yet, so it still renders the flat row below — the row upgrades to
  // a card in place the instant `useChatStream` merges in the matching `ok` event
  // (same callId), with no extra state needed here.
  if (event.runRef) {
    return <ChatRunCard runRef={event.runRef} target={event.target} />;
  }

  const summary = event.summary ?? event.name;
  const body = (
    <Stack direction="col" gap="50">
      {event.target && <TargetIdentity targets={[event.target]} />}
      <Stack align="center" data-testid={ChatMessageTestId.ToolEvent} direction="row" gap="75">
        <StatusDot pulse={event.status === "started"} tone={toolTone(event.status)} />
        <Typography mono size="xs" type="note" variant="secondary">
          {summary}
        </Typography>
        {event.href && <Icon name="chevron" size="sm" tone="faint" />}
      </Stack>
    </Stack>
  );

  if (!event.href) return body;
  return (
    <Link
      data-testid={ChatMessageTestId.ToolEventLink}
      href={event.href as Route}
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
      {!isUser && (
        <Stack align="center" data-testid={ChatMessageTestId.AssistantIdentity} direction="row" gap="50">
          <IconTile glyph="butlerSign" size="sm" tone="accent" />
          <Typography mono size="xs" tone="accent" type="note">
            ZIBBY
          </Typography>
        </Stack>
      )}
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
