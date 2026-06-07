import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Injectable, Logger } from "@nestjs/common"
import { type RateLimitSnapshot, clampPct } from "./rate-limits.reader"

const execFileAsync = promisify(execFile)

/** A minimal `Headers`-like reader — just enough of the standard `Headers` API. */
export interface HeaderBag {
  get(name: string): string | null
}

/** Parse a header value as a finite number, or null when absent/non-numeric. */
function num(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Project the `anthropic-ratelimit-unified-*` response headers into a snapshot.
 * Pure. The `-utilization` headers are floats in `[0, 1]` (→ whole percent), the
 * `-reset` headers are Unix **seconds** (→ epoch ms). Returns `null` when neither
 * window's utilization header is present/numeric — the caller then falls back to
 * the status-line capture rather than reporting a bogus 0%.
 */
export function parseUsageHeaders(headers: HeaderBag, now: number): RateLimitSnapshot | null {
  const u5 = num(headers.get("anthropic-ratelimit-unified-5h-utilization"))
  const u7 = num(headers.get("anthropic-ratelimit-unified-7d-utilization"))
  if (u5 === null && u7 === null) return null

  const r5 = num(headers.get("anthropic-ratelimit-unified-5h-reset"))
  const r7 = num(headers.get("anthropic-ratelimit-unified-7d-reset"))

  return {
    rolling5hPct: clampPct((u5 ?? 0) * 100),
    weekly7dPct: clampPct((u7 ?? 0) * 100),
    rolling5hResetsAt: r5 === null ? null : Math.round(r5 * 1000),
    weekly7dResetsAt: r7 === null ? null : Math.round(r7 * 1000),
    capturedAt: now,
    stale: false,
  }
}

/** The macOS Keychain item Claude Code stores its OAuth credentials under. */
const KEYCHAIN_SERVICE = "Claude Code-credentials"

/**
 * Fetches the real interactive-window utilization straight from Anthropic. Unlike
 * the status-line capture (which only refreshes while Claude Code is rendering, so
 * it ages out the moment the user steps away), this reads the authoritative
 * `anthropic-ratelimit-unified-*` headers off a deliberately tiny `/v1/messages`
 * request — so the numbers are fresh whenever we ask, independent of any UI.
 *
 * The OAuth token comes from the macOS Keychain (the same credential Claude Code
 * itself uses), so this works under the Max subscription with no API key. The two
 * external seams — {@link getToken} and {@link doFetch} — are `protected` so tests
 * subclass with stubs instead of hitting the Keychain or the network.
 */
@Injectable()
export class UsageFetcher {
  private readonly logger = new Logger(UsageFetcher.name)

  protected now(): number {
    return Date.now()
  }

  /** Read `claudeAiOauth.accessToken` from the Keychain, or null if unavailable. */
  protected async getToken(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
      ])
      const token = (JSON.parse(stdout) as { claudeAiOauth?: { accessToken?: unknown } }).claudeAiOauth
        ?.accessToken
      return typeof token === "string" && token.length > 0 ? token : null
    } catch (err) {
      this.logger.debug(`oauth token not readable: ${(err as Error).message}`)
      return null
    }
  }

  /** The raw HTTP call. Overridable for tests; production uses global `fetch`. */
  protected doFetch(token: string): Promise<Response> {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    })
  }

  /**
   * One live reading, or `null` if we couldn't get one (no token, network error,
   * or headers absent — including on a 429, whose headers we still parse). The
   * caller treats `null` as "fall back to the status-line capture".
   */
  async fetch(): Promise<RateLimitSnapshot | null> {
    // Never touch the Keychain or the network under the test runner: the e2e suite
    // exercises the real endpoint, and a live call there would burn the user's quota
    // on every `pnpm test`. Tests that want the live path stub `doFetch` directly.
    if (process.env.VITEST) return null
    const token = await this.getToken()
    if (token === null) return null
    try {
      const res = await this.doFetch(token)
      // Drain the body so the socket is freed even though we only want headers.
      await res.text().catch(() => undefined)
      return parseUsageHeaders(res.headers, this.now())
    } catch (err) {
      this.logger.debug(`usage fetch failed: ${(err as Error).message}`)
      return null
    }
  }
}
