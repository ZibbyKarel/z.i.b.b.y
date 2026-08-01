import { useId } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Card, Container, Icon, Stack, StatusDot, Typography } from "@zibby/design-system";
import type { DotTone } from "@zibby/design-system";
import type { Briefing, ChatMessage as ChatMessageType, ChatToolEvent } from "@zibby/contracts";
import { MarkdownProse } from "../../../components/MarkdownProse/MarkdownProse";
import { useSystemConfigQuery } from "../../system";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { useSynthesizeSpeechMutation } from "../mutations/useSynthesizeSpeechMutation";
import { BriefingMessageCard } from "./BriefingMessageCard";
import { ChatRunCard } from "./ChatRunCard";
import { TargetIdentity } from "./TargetIdentity";

export enum ChatMessageTestId {
  Root = "chat-message",
  UserBubble = "chat-message-user",
  AssistantBubble = "chat-message-assistant",
  Text = "chat-message-text",
  ToolEvent = "chat-message-tool-event",
  ToolEventLink = "chat-message-tool-event-link",
  StreamingCursor = "chat-message-streaming-cursor",
  ReadAloudButton = "chat-message-read-aloud",
}

export interface ChatMessageProps {
  role: ChatMessageType["role"];
  text: string;
  toolEvents?: ChatToolEvent[];
  /**
   * F8a (O6) — a structured butler-briefing payload riding this (always
   * `role: "assistant"`) turn. When present it renders as a distinguishable card
   * ({@link BriefingMessageCard}) INSTEAD of the markdown bubble — `text` still
   * carries the briefing's headline as a plain-text fallback (unused by this
   * component when `briefing` is set, but read by anything that only looks at
   * `.text`, e.g. a future search over the transcript).
   */
  briefing?: Briefing;
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
 * Manual "read aloud" trigger for one completed assistant message (Phase 120).
 * `useId()` gives this mounted instance a stable player key so
 * {@link useAudioPlayback} knows whether IT is the one currently speaking (the
 * player is a module-level singleton — only one message speaks at a time).
 * Idle → `play`; synthesizing → the `Button`'s own spinner (`loading`,
 * suppresses clicks); speaking → `stop`, clicking stops it. A failed
 * synthesize call throws and is surfaced by the app-wide mutation-error toast
 * (`MutationCache.onError`) — nothing bespoke here.
 *
 * Sends the operator's `/settings` voice pick (`SystemConfig.ttsVoice`, Phase
 * 119c) when set; omitting the key when it's `null` (the common case) lets the
 * daemon use its own default rather than sending an explicit "default" id it
 * may not recognize.
 */
function ReadAloudButton({ text }: { text: string }) {
  const t = useTranslations("chat");
  const key = useId();
  const { isPlaying, play, stop } = useAudioPlayback(key);
  const synthesize = useSynthesizeSpeechMutation();
  const { data: config } = useSystemConfigQuery();

  const handleClick = () => {
    if (isPlaying) {
      stop();
      return;
    }
    synthesize.mutate(
      { body: { text, ...(config?.ttsVoice ? { voice: config.ttsVoice } : {}) } },
      { onSuccess: (result) => play(result.body.audioBase64) },
    );
  };

  const label = t(isPlaying ? "readAloudStop" : "readAloud");

  return (
    <Button
      aria-label={label}
      data-testid={ChatMessageTestId.ReadAloudButton}
      icon={isPlaying ? "stop" : "play"}
      intent="ghost"
      loading={synthesize.isPending}
      onClick={handleClick}
      size="sm"
      title={label}
    />
  );
}

/**
 * One transcript message. User turns sit to the right in a filled bubble;
 * assistant turns sit to the left, render their (possibly streaming) text and any
 * inline tool-dispatch announcements with a link into the app. While `streaming`,
 * a trailing cursor signals tokens are still arriving.
 *
 * Phase 33 dropped the per-message "Zibby" name + bowler-hat header — role is
 * read from the bubble's background tone instead (accent-tinted for the
 * operator's own turn, the plain raised surface for ZIBBY's reply — Velin-D
 * design-match: the operator's turn is the one that stands out), so nothing
 * repeats per turn.
 */
export function ChatMessage({ role, text, toolEvents, briefing, streaming }: ChatMessageProps) {
  const t = useTranslations("chat");
  const isUser = role === "user";

  return (
    <Stack
      align={isUser ? "end" : "start"}
      data-testid={ChatMessageTestId.Root}
      direction="col"
      gap="75"
    >
      {briefing ? (
        // F8a (O6) — the structured card replaces the markdown bubble entirely
        // (not a sibling to it): a briefing turn has no prose to format, and the
        // card is the transcript-native rendering of its rows/counters.
        <BriefingMessageCard briefing={briefing} />
      ) : (
        <Card
          background={isUser ? "accent" : "raised"}
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
      )}

      {toolEvents && toolEvents.length > 0 && (
        <Stack direction="col" gap="50">
          {toolEvents.map((event, i) => (
            <ToolEventRow event={event} key={`${event.name}-${i}`} />
          ))}
        </Stack>
      )}

      {/* Manual read-aloud (Phase 120) — only on a settled assistant turn, never
          the live-streaming bubble (its text isn't final yet), a user turn, or a
          briefing card (structured rows, not prose — nothing sensible to read). */}
      {!isUser && !streaming && !briefing && text.trim().length > 0 && (
        <ReadAloudButton text={text} />
      )}
    </Stack>
  );
}
