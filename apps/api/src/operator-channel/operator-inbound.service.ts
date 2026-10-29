import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { ChatToolEvent, OperatorChannelSettings } from "@zibby/contracts";
import { filter } from "rxjs";
import { ChatEventsService, type ChatTurnEvent } from "../chat/chat-events.service";
import { ChatSessionService, mergeToolEvent } from "../chat/chat-session.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import {
  type MessageRef,
  type OperatorInboundEvent,
  type OperatorNotification,
  RateLimitedError,
} from "./operator-channel.port";
import { OperatorChannelService } from "./operator-channel.service";
import { OperatorChannelStore } from "./operator-channel.store";
import { OPERATOR_MESSAGES, escapeMrkdwn, fill, zibbyLink } from "./operator-messages";

/** Slack section text tops out at 3000 chars; a chunk leaves room for the run/notice lines. */
const CHUNK_CHARS = 2500;
/** Max 429 retries for one chat-reply send/update. */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * The stable chat conversation for the operator's top-level bot DM: one Slack DM =
 * one conversation, so `--resume` keeps context across Slack turns and the web chat
 * lists it like any other thread. Thread replies (Phase 3) will bind their own.
 */
export const operatorConversationId = (dmChannelId: string): string => `slack-dm-${dmChannelId}`;

/**
 * Step 1 of the trust boundary (Law 4): why an inbound event must NOT become an
 * operator turn, or `null` when it may. Authentication is ONLY the Slack user id
 * against the on-disk allowlist plus the bot DM's channel id (and `im` type) — never
 * a name, display text or message content. Bot messages (ZIBBY's own included) and
 * every subtype (edit/delete/join/…) are dropped.
 */
export function rejectReason(
  event: OperatorInboundEvent,
  settings: OperatorChannelSettings,
): string | null {
  if (!settings.enabled) return "disabled";
  if (!settings.operatorUserIds.includes(event.userId)) return "not-operator";
  if (!settings.dmChannelId || event.channelId !== settings.dmChannelId) return "not-bot-dm";
  if (event.kind === "message") {
    if (event.channelType !== "im") return "not-im";
    if (event.botId) return "bot";
    if (event.subtype) return "subtype";
  }
  if (!event.text.trim()) return "empty";
  return null;
}

/** Split an answer into Slack-sized chunks, preferring a line break before the limit. */
export function splitAnswer(text: string, max: number = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const nl = rest.lastIndexOf("\n", max);
    const cut = nl > max / 2 ? nl : max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  out.push(rest);
  return out;
}

const chatNote = (
  lines: string[],
  extra: Partial<Pick<OperatorNotification, "links" | "replies">> = {},
): OperatorNotification => ({ kind: "chat", tier: 2, headline: "", lines, links: [], ...extra });

type TurnOutcome = { text: string; tools: ChatToolEvent[] } | { error: string };

/**
 * `OperatorInbound` — the operator's bot DM as a second front-end onto the SAME chat
 * session the web composer uses. An event that passes {@link rejectReason} and the
 * persisted dedupe becomes `ChatSessionService.sendMessage({ conversationId, text })`
 * — the identical entry point as `POST /api/chat/messages`, so the prompt, the
 * governor, every chat MCP tool and the gate are reused, never forked. The reply
 * streams back as a placeholder updated at coarse milestones (a tool started) at
 * most once per {@link updateIntervalMs}; the final answer replaces it (split when
 * long), with the run link for a dispatched task and Yes/No reply buttons when the
 * answer ends in a question. A button click is just the operator's next turn.
 *
 * Guards: {@link maxPerMinute} / {@link maxPerDay} accepted turns, one in-flight
 * turn per conversation with up to {@link maxQueued} waiting behind it (the rest
 * get a "busy" notice), and {@link maxTextChars} on the text handed to the model.
 * Spend is governed where it always is: a dispatched task hits the scheduler's
 * budget guard (hold + approval) exactly as from the web.
 *
 * Rejected events are dropped silently (debug log, no reply) — ZIBBY never reveals
 * itself to a stranger.
 */
@Injectable()
export class OperatorInboundService implements OnModuleInit, OnModuleDestroy {
  maxPerMinute = 6;
  maxPerDay = 200;
  maxQueued = 3;
  maxTextChars = 4000;
  /** Throttle for placeholder updates (Slack `chat.update`); tests set 0. */
  updateIntervalMs = 2000;
  /** Safety net above the chat's own 120 s turn timeout. */
  turnTimeoutMs = 150_000;
  now: () => Date = () => new Date();
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  private readonly log: ScopedLogger;
  private readonly accepted: number[] = [];
  private intake: Promise<unknown> = Promise.resolve();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly channel: OperatorChannelService,
    private readonly store: OperatorChannelStore,
    private readonly session: ChatSessionService,
    private readonly events: ChatEventsService,
    logger: LoggerService,
  ) {
    this.log = logger.child(OperatorInboundService.name);
  }

  onModuleInit(): void {
    void this.channel.listen((event) => this.handle(event));
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.stop();
  }

  /** One inbound event → (auth, dedupe, guards) → a queued chat turn. Resolves when it's answered. */
  async handle(event: OperatorInboundEvent): Promise<void> {
    // Admission is serial so turns queue in the order Slack delivered them.
    const admitted = this.intake.then(() => this.admit(event));
    this.intake = admitted.catch(() => undefined);
    const turn = await admitted;
    if (turn) await turn.done;
  }

  /** Auth, dedupe, guards; returns the queued turn (wrapped — a bare promise would be awaited here). */
  private async admit(event: OperatorInboundEvent): Promise<{ done: Promise<void> } | null> {
    const settings = await this.store.readSettings();
    const why = rejectReason(event, settings);
    if (why) {
      this.log.debug("operator inbound dropped", { why, kind: event.kind });
      return null;
    }
    if (!(await this.store.markInboundSeen(event.eventId, this.now()))) {
      this.log.debug("operator inbound duplicate", { kind: event.kind });
      return null;
    }
    const m = OPERATOR_MESSAGES[settings.locale].chat;
    if (event.kind === "action") {
      // Drop the buttons so the prompt reads as answered (and can't be tapped again).
      await this.retry(() =>
        this.channel.update(
          { channel: event.channelId, ts: event.messageTs },
          chatNote([event.messageText, escapeMrkdwn(fill(m.answered, { text: event.text }))]),
        ),
      ).catch((error: unknown) => this.log.warn("prompt update failed", { err: errText(error) }));
    }

    const limited = this.overLimit();
    if (limited) {
      await this.notice(
        fill(limited === "minute" ? m.perMinute : m.perDay, {
          n: limited === "minute" ? this.maxPerMinute : this.maxPerDay,
        }),
      );
      return null;
    }
    if (this.pending > this.maxQueued) {
      await this.notice(m.busy);
      return null;
    }
    this.accepted.push(this.now().getTime());
    this.pending += 1;
    const done = this.queue
      .then(() => this.runTurn(event.text, settings))
      .finally(() => {
        this.pending -= 1;
      });
    this.queue = done.catch(() => undefined);
    return { done };
  }

  private overLimit(): "minute" | "day" | null {
    const now = this.now().getTime();
    while (this.accepted.length > 0 && (this.accepted[0] ?? 0) <= now - 24 * 60 * 60 * 1000) {
      this.accepted.shift();
    }
    if (this.accepted.length >= this.maxPerDay) return "day";
    const lastMinute = this.accepted.filter((t) => t > now - 60_000).length;
    return lastMinute >= this.maxPerMinute ? "minute" : null;
  }

  private async notice(text: string): Promise<void> {
    await this.retry(() => this.channel.send(chatNote([escapeMrkdwn(text)]))).catch(
      (error: unknown) => this.log.warn("operator notice failed", { err: errText(error) }),
    );
  }

  /** Placeholder → chat turn → milestones → final answer, all in the operator DM. */
  private async runTurn(raw: string, settings: OperatorChannelSettings): Promise<void> {
    const m = OPERATOR_MESSAGES[settings.locale].chat;
    const conversationId = operatorConversationId(settings.dmChannelId ?? "");
    const truncated = raw.length > this.maxTextChars;
    const text = truncated ? raw.slice(0, this.maxTextChars) : raw;

    const placeholder = await this.retry(() => this.channel.send(chatNote([m.thinking])));
    let lastUpdate = this.now().getTime();
    let progress: Promise<void> = Promise.resolve();
    const milestone = (label: string): void => {
      if (this.now().getTime() - lastUpdate < this.updateIntervalMs) return;
      lastUpdate = this.now().getTime();
      progress = progress
        .then(() =>
          this.retry(() =>
            this.channel.update(
              placeholder,
              chatNote([escapeMrkdwn(fill(m.working, { tool: label }))]),
            ),
          ),
        )
        .catch((error: unknown) =>
          this.log.warn("milestone update failed", { err: errText(error) }),
        );
    };

    const outcome = await this.chatTurn(conversationId, text, milestone);
    await progress;
    const wait = this.updateIntervalMs - (this.now().getTime() - lastUpdate);
    if (wait > 0) await this.sleep(wait);

    if ("error" in outcome) {
      await this.retry(() =>
        this.channel.update(
          placeholder,
          chatNote([escapeMrkdwn(fill(m.error, { message: outcome.error }))]),
        ),
      );
      return;
    }
    await this.deliverAnswer(placeholder, outcome, settings, truncated);
  }

  /** Start the turn through the chat session and wait for its `done`/`error` event. */
  private async chatTurn(
    conversationId: string,
    text: string,
    milestone: (label: string) => void,
  ): Promise<TurnOutcome> {
    let turnId: string | null = null;
    let tools: ChatToolEvent[] = [];
    const early: ChatTurnEvent[] = [];
    let settle: (outcome: TurnOutcome) => void = () => undefined;
    const finished = new Promise<TurnOutcome>((resolve) => {
      settle = resolve;
    });
    const apply = (e: ChatTurnEvent): void => {
      if (e.type === "tool") {
        tools = mergeToolEvent(tools, e.tool);
        milestone(e.tool.summary ?? e.tool.name);
      } else if (e.type === "done") settle({ text: e.text, tools });
      else if (e.type === "error") settle({ error: e.message });
    };
    // Subscribed BEFORE the send: the turn id is only known once sendMessage returns.
    const sub = this.events
      .stream()
      .pipe(filter((e) => e.conversationId === conversationId))
      .subscribe((e) => {
        if (turnId === null) early.push(e);
        else if (e.turnId === turnId) apply(e);
      });
    const timer = setTimeout(() => settle({ error: "timeout" }), this.turnTimeoutMs);
    timer.unref?.();
    try {
      const res = await this.session.sendMessage({ conversationId, text });
      turnId = res.turnId;
      for (const e of early) if (e.turnId === turnId) apply(e);
      return await finished;
    } catch (error) {
      return { error: errText(error) };
    } finally {
      clearTimeout(timer);
      sub.unsubscribe();
    }
  }

  private async deliverAnswer(
    placeholder: MessageRef,
    outcome: { text: string; tools: ChatToolEvent[] },
    settings: OperatorChannelSettings,
    truncated: boolean,
  ): Promise<void> {
    const m = OPERATOR_MESSAGES[settings.locale].chat;
    const answer = outcome.text.trim() || m.empty;
    const chunks = splitAnswer(escapeMrkdwn(answer));
    const runs = outcome.tools.filter((t) => t.name === "create_task" && t.status === "ok");
    const tail = [
      ...runs.map((t) => fill(m.run, { taskId: t.taskId ?? "?", runRef: t.runRef ?? "?" })),
      ...(truncated ? [fill(m.truncated, { n: this.maxTextChars })] : []),
    ].map(escapeMrkdwn);
    const links = runs.flatMap((t) => {
      const url = zibbyLink(settings.publicBaseUrl, t.href);
      return url ? [{ label: m.openRun, url }] : [];
    });
    // The chat asks to confirm → offer Yes/No; a tap is the operator's next turn.
    const replies = answer.endsWith("?")
      ? [
          { label: m.yes, text: m.yesText },
          { label: m.no, text: m.noText },
        ]
      : [];

    for (const [i, chunk] of chunks.entries()) {
      const last = i === chunks.length - 1;
      const note = last
        ? chatNote([chunk, ...tail], { links: links.slice(0, 5), replies })
        : chatNote([chunk]);
      if (i === 0) await this.retry(() => this.channel.update(placeholder, note));
      else await this.retry(() => this.channel.send(note));
    }
  }

  /** One send/update, retrying a 429 after its `Retry-After`. */
  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!(error instanceof RateLimitedError) || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
        await this.sleep(error.retryAfterMs);
      }
    }
  }
}

const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
