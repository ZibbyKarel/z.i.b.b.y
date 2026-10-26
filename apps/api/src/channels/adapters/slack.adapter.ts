import type {
  ChannelItem,
  CredentialsInput,
  ExternalRef,
  Integration,
  TestResult,
} from "@zibby/contracts";
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter";

/** Slack Web API base; overridable for unit tests that inject a fake fetch. */
const SLACK_API = "https://slack.com/api";

/** First poll (no cursor) looks back this far instead of importing the whole history. */
const FIRST_POLL_LOOKBACK_S = 24 * 60 * 60;

/** Max IM/MPIM conversations whose history is read per DM sweep (see the ponytail note in poll). */
const MAX_DM_CONVERSATIONS = 50;

/**
 * The DM leg costs up to {@link MAX_DM_CONVERSATIONS} `conversations.history` calls
 * (Tier 3, ~50/min), so it runs at most this often — not on every 30s tick.
 */
const DM_SWEEP_INTERVAL_MS = 2 * 60 * 1000;

/** `search.messages` indexes with a lag, so the mention leg re-reads this far behind the cursor (dedup-by-id absorbs repeats). */
const SEARCH_OVERLAP_S = 15 * 60;

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
}

interface AuthTestResponse extends SlackResponse {
  team?: string;
  user?: string;
  user_id?: string;
  bot_id?: string;
}

interface SearchMatch extends SlackMessage {
  permalink?: string;
  channel?: { id?: string };
}

/** Extract a slack user token from the closed credentials union (null if absent). */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/**
 * Slack adapter over plain `fetch` (Node 20+ global — no new dependency), scoped to
 * "mine and mentions" (see `channels/README.md`). Needs a Slack USER token (`xoxp-…`;
 * scopes `im:history, mpim:history, channels:history, groups:history, search:read,
 * chat:write, users:read`) — a bot token cannot search and would only ever see the
 * channels it was invited to. Two legs, merged and de-duplicated by the deterministic
 * `<channel>-<ts>` id (`.`→`-`):
 *   1. direct messages — every human message in the operator's 1:1 IMs and group MPIMs
 *      (`users.conversations` + `conversations.history` with `oldest` = the cursor);
 *   2. explicit `<@operator>` mentions anywhere the user can see (`search.messages`),
 *      optionally narrowed by `config.channels`.
 * The operator's own messages, bot messages and subtype/system messages are skipped.
 * The DM leg sweeps at most every {@link DM_SWEEP_INTERVAL_MS} (rate-limit budget) and
 * owns the cursor; the mention leg runs every tick and re-reads
 * {@link SEARCH_OVERLAP_S} behind it (search index lag; the item store dedups by id).
 *
 * A 429 / rate-limit response is thrown as a surfaced error: the caller (the watcher)
 * stamps `lastError` and the tick stays fast — it never sleeps on `retry_after`, it
 * skips and tries next tick.
 */
export class SlackChannelAdapter implements ChannelAdapter {
  readonly kind = "slack" as const;

  /** Operator user id from `auth.test`, cached per token for the process lifetime. */
  private readonly userIds = new Map<string, string>();

  /** When the DM leg last swept, per integration id (in-memory; a restart sweeps at once). */
  private readonly lastDmSweep = new Map<string, number>();

  /** Clock seam for tests. */
  protected now(): number {
    return Date.now();
  }

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** GET a Web API method; surfaces 429 and `ok:false` as errors, never sleeps. */
  private async call<T extends SlackResponse>(
    token: string,
    method: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const res = await this.fetchImpl(`${SLACK_API}/${method}?${new URLSearchParams(params)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    // Honor rate limits by surfacing, never sleeping (keeps the tick O(fast)).
    if (res.status === 429) {
      throw new Error(`slack rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`);
    }
    const body = (await res.json()) as T;
    if (!body.ok) throw new Error(`${method}: ${body.error ?? "unknown error"}`);
    return body;
  }

  private async operatorId(token: string): Promise<string> {
    const cached = this.userIds.get(token);
    if (cached) return cached;
    const { user_id } = await this.call<AuthTestResponse>(token, "auth.test");
    if (!user_id) throw new Error("auth.test: no user_id (needs a Slack user token)");
    this.userIds.set(token, user_id);
    return user_id;
  }

  /**
   * Best-effort permalink lookup (Phase 127) — used for the DM leg only (search matches
   * carry their own). One extra call per NEW message (polling only ever fetches deltas).
   * Never throws: a failed lookup just means the item ships without a `url`, a
   * nice-to-have not worth failing the poll over.
   */
  private async getPermalink(
    token: string,
    channel: string,
    ts: string,
  ): Promise<string | undefined> {
    try {
      const params = new URLSearchParams({ channel, message_ts: ts });
      const res = await this.fetchImpl(`${SLACK_API}/chat.getPermalink?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { ok: boolean; permalink?: string };
      return body.ok ? body.permalink : undefined;
    } catch {
      return undefined;
    }
  }

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    const token = tokenOf(creds);
    if (!token) return { ok: false, detail: "no slack token configured" };
    try {
      const res = await this.fetchImpl(`${SLACK_API}/auth.test`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as AuthTestResponse;
      if (!body.ok) return { ok: false, detail: body.error ?? "auth.test failed" };
      if (body.bot_id || token.startsWith("xoxb-")) {
        return { ok: false, detail: "needs a Slack user token (xoxp-…), not a bot token" };
      }
      const who = [body.user, body.team && `in ${body.team}`].filter(Boolean).join(" ");
      return { ok: true, detail: `authenticated${who ? ` as ${who}` : ""}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    const token = tokenOf(creds);
    if (!token) throw new Error("no slack token configured");
    if (integration.config.kind !== "slack") throw new Error("not a slack integration");
    const allow = integration.config.channels;

    const me = await this.operatorId(token);
    // The cursor is the DM leg's high-water mark: it only advances on a DM sweep, so a
    // skipped sweep never lets the mention leg move it past unread DMs.
    // No cursor → don't import the whole history, only the last day.
    const oldest = cursor ?? String(Math.floor(this.now() / 1000) - FIRST_POLL_LOOKBACK_S);
    const isHuman = <M extends SlackMessage>(m: M): m is M & { ts: string } =>
      !!m.ts && !m.bot_id && !m.subtype && m.user !== me;

    const found = new Map<string, InboundMessage>();
    const add = (channel: string, m: SlackMessage & { ts: string }, url?: string): void => {
      const id = `${channel}-${m.ts.replace(/\./g, "-")}`;
      if (found.has(id)) return;
      const ref: ExternalRef = { channel, ts: m.ts, threadTs: m.thread_ts };
      found.set(id, {
        id,
        externalRef: ref,
        from: m.user,
        receivedAt: new Date(Math.floor(Number(m.ts) * 1000) || 0).toISOString(),
        text: m.text ?? "",
        raw: m,
        url,
      });
    };

    // Leg 1 — DMs. Slack's documented search syntax has no DM/date modifier we can rely
    // on, so list the IM/MPIM conversations and read only `oldest` = cursor deltas.
    // ponytail: ≤ MAX_DM_CONVERSATIONS history calls per tick (first page of
    // users.conversations only, unordered) — a DM beyond that is not read; switch to
    // conversations.list `updated` / Events API if operators exceed it.
    const lastSweep = this.lastDmSweep.get(integration.id);
    const sweepDms = lastSweep === undefined || this.now() - lastSweep >= DM_SWEEP_INTERVAL_MS;
    let newestTs = cursor;
    if (sweepDms) {
      this.lastDmSweep.set(integration.id, this.now());
      const convs = await this.call<SlackResponse & { channels?: { id: string }[] }>(
        token,
        "users.conversations",
        { types: "im,mpim", exclude_archived: "true", limit: String(MAX_DM_CONVERSATIONS) },
      );
      for (const { id: channel } of (convs.channels ?? []).slice(0, MAX_DM_CONVERSATIONS)) {
        const hist = await this.call<SlackResponse & { messages?: SlackMessage[] }>(
          token,
          "conversations.history",
          { channel, oldest, limit: "50" },
        );
        for (const m of hist.messages ?? []) {
          if (!m.ts) continue;
          if (newestTs === undefined || Number(m.ts) > Number(newestTs)) newestTs = m.ts;
          if (!isHuman(m) || Number(m.ts) <= Number(oldest)) continue;
          if (found.has(`${channel}-${m.ts.replace(/\./g, "-")}`)) continue;
          add(channel, m, await this.getPermalink(token, channel, m.ts));
        }
      }
      // Nothing new in any DM → the sweep still covered everything up to now.
      if (newestTs === cursor) newestTs = String(Math.floor(this.now() / 1000) - SEARCH_OVERLAP_S);
      if (cursor !== undefined && Number(newestTs) < Number(cursor)) newestTs = cursor;
    }

    // Leg 2 — explicit @-mentions anywhere the user can see. Date filters are
    // day-granular, so newest-first and cut by ts inside the adapter. Thread replies the
    // operator took part in without being mentioned are out of scope.
    const search = await this.call<SlackResponse & { messages?: { matches?: SearchMatch[] } }>(
      token,
      "search.messages",
      {
        query: `<@${me}>`,
        sort: "timestamp",
        sort_dir: "desc",
        count: "50",
      },
    );
    const mentionsAfter = Number(oldest) - SEARCH_OVERLAP_S;
    for (const m of search.messages?.matches ?? []) {
      const channel = m.channel?.id;
      if (!channel || !isHuman(m) || Number(m.ts) <= mentionsAfter) continue;
      if (allow.length > 0 && !allow.includes(channel)) continue;
      add(channel, m, m.permalink);
    }

    return { items: [...found.values()], cursor: newestTs };
  }

  /** Reply in-thread; with a user token this posts as the operator. */
  async send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    const token = tokenOf(creds);
    if (!token) throw new Error("no slack token configured");
    const ref: ExternalRef = item.externalRef;
    const res = await this.fetchImpl(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ channel: ref.channel, thread_ts: ref.threadTs ?? ref.ts, text }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) throw new Error(`chat.postMessage: ${body.error ?? "unknown error"}`);
  }
}
