import type { CredentialsInput, ExternalRef, Integration, TestResult } from "@zibby/contracts"
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter"

/** Slack Web API base; overridable for unit tests that inject a fake fetch. */
const SLACK_API = "https://slack.com/api"

interface SlackMessage {
  type?: string
  subtype?: string
  user?: string
  text?: string
  ts?: string
  thread_ts?: string
  bot_id?: string
}

interface HistoryResponse {
  ok: boolean
  error?: string
  messages?: SlackMessage[]
}

/** Extract a slack bot token from the closed credentials union (null if absent). */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null
}

/**
 * Slack adapter over plain `fetch` (Node 20+ global — no new dependency). Polls
 * `conversations.history` per configured channel with `oldest` = the cursor ts,
 * normalizes each human message to an {@link InboundMessage} with a deterministic
 * `<channel>-<ts>` id (`.`→`-`), and advances the cursor to the newest ts seen.
 *
 * A 429 / rate-limit response is recorded as a surfaced error, NOT thrown: the
 * caller (the watcher) stamps `lastError` and the tick stays fast — it never sleeps
 * on `retry_after`, it skips and tries next tick.
 */
export class SlackChannelAdapter implements ChannelAdapter {
  readonly kind = "slack" as const

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    const token = tokenOf(creds)
    if (!token) return { ok: false, detail: "no slack token configured" }
    try {
      const res = await this.fetchImpl(`${SLACK_API}/auth.test`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      })
      const body = (await res.json()) as { ok: boolean; error?: string; team?: string }
      return body.ok
        ? { ok: true, detail: `authenticated${body.team ? ` as ${body.team}` : ""}` }
        : { ok: false, detail: body.error ?? "auth.test failed" }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    const token = tokenOf(creds)
    if (!token) throw new Error("no slack token configured")
    if (integration.config.kind !== "slack") throw new Error("not a slack integration")

    const items: InboundMessage[] = []
    let newestTs = cursor

    for (const channel of integration.config.channels) {
      const params = new URLSearchParams({ channel, limit: "50" })
      if (cursor) params.set("oldest", cursor)
      const res = await this.fetchImpl(`${SLACK_API}/conversations.history?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      // Honor rate limits by surfacing, never sleeping (keeps the tick O(fast)).
      if (res.status === 429) {
        throw new Error(`slack rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`)
      }
      const body = (await res.json()) as HistoryResponse
      if (!body.ok) throw new Error(`conversations.history: ${body.error ?? "unknown error"}`)

      for (const m of body.messages ?? []) {
        // Skip bot/system messages and anything without a ts (our own replies, joins…).
        if (!m.ts || m.bot_id || m.subtype) continue
        const ref: ExternalRef = { channel, ts: m.ts, threadTs: m.thread_ts }
        items.push({
          id: `${channel}-${m.ts.replace(/\./g, "-")}`,
          externalRef: ref,
          from: m.user,
          receivedAt: new Date(Math.floor(Number(m.ts) * 1000) || 0).toISOString(),
          text: m.text ?? "",
          raw: m,
        })
        if (newestTs === undefined || Number(m.ts) > Number(newestTs)) newestTs = m.ts
      }
    }

    return { items, cursor: newestTs }
  }

  async send(
    integration: Integration,
    creds: CredentialsInput,
    ref: ExternalRef,
    text: string,
  ): Promise<void> {
    const token = tokenOf(creds)
    if (!token) throw new Error("no slack token configured")
    const res = await this.fetchImpl(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ channel: ref.channel, thread_ts: ref.threadTs ?? ref.ts, text }),
    })
    const body = (await res.json()) as { ok: boolean; error?: string }
    if (!body.ok) throw new Error(`chat.postMessage: ${body.error ?? "unknown error"}`)
  }
}
