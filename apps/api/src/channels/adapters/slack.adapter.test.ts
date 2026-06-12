import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { Integration } from "@zibby/contracts"
import { describe, expect, it, vi } from "vitest"
import { SlackChannelAdapter } from "./slack.adapter"

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test/fixtures/slack")

const slack: Integration = {
  id: "team-slack",
  kind: "slack",
  enabled: true,
  config: { kind: "slack", channels: ["C123"] },
  status: "disconnected",
  hasCredentials: true,
}

/** Build a fetch stub that returns the given JSON body (status 200 by default). */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch
}

describe("SlackChannelAdapter", () => {
  it("normalizes human messages, skips bot/system, derives ids and advances the cursor", async () => {
    const history = JSON.parse(await fs.readFile(path.join(FIXTURES, "history.json"), "utf8"))
    const adapter = new SlackChannelAdapter(jsonFetch(history))

    const { items, cursor } = await adapter.poll(slack, { token: "xoxb-1" }, undefined)

    // Only the two human messages survive (channel_join + bot_id dropped).
    expect(items.map((i) => i.from)).toEqual(["U123", "U456"])
    // Deterministic id: <channel>-<ts with . → ->.
    expect(items[0]!.id).toBe("C123-1700000100-000200")
    expect(items[0]!.externalRef).toMatchObject({ channel: "C123", ts: "1700000100.000200" })
    expect(items[0]!.text).toContain("crashes on login")
    // Cursor advanced to the newest human ts.
    expect(cursor).toBe("1700000200.000300")
  })

  it("passes the cursor as `oldest` on a subsequent poll", async () => {
    const fetchImpl = jsonFetch({ ok: true, messages: [] })
    const adapter = new SlackChannelAdapter(fetchImpl)
    await adapter.poll(slack, { token: "xoxb-1" }, "1700000200.000300")
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain("oldest=1700000200.000300")
  })

  it("surfaces a 429 as an error rather than throwing out of the loop silently", async () => {
    const adapter = new SlackChannelAdapter(jsonFetch({ ok: false }, 429))
    await expect(adapter.poll(slack, { token: "xoxb-1" }, undefined)).rejects.toThrow(/rate limited/)
  })

  it("auth.test maps ok/err to a TestResult", async () => {
    const ok = new SlackChannelAdapter(jsonFetch({ ok: true, team: "Acme" }))
    expect(await ok.test(slack, { token: "xoxb-1" })).toEqual({ ok: true, detail: "authenticated as Acme" })
    const bad = new SlackChannelAdapter(jsonFetch({ ok: false, error: "invalid_auth" }))
    expect(await bad.test(slack, { token: "xoxb-1" })).toEqual({ ok: false, detail: "invalid_auth" })
  })

  it("send posts to the thread and rejects on a slack error", async () => {
    const item = {
      id: "C123-1-2",
      integrationId: "team-slack",
      kind: "slack" as const,
      externalRef: { channel: "C123", ts: "1.2" },
      receivedAt: "2026-06-12T00:00:00.000Z",
      text: "hi",
      raw: {},
      state: "triaged" as const,
    }
    const fetchImpl = jsonFetch({ ok: true })
    const adapter = new SlackChannelAdapter(fetchImpl)
    await adapter.send(slack, { token: "xoxb-1" }, item, "on it")
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({ channel: "C123", thread_ts: "1.2", text: "on it" })

    const failing = new SlackChannelAdapter(jsonFetch({ ok: false, error: "channel_not_found" }))
    await expect(
      failing.send(slack, { token: "xoxb-1" }, { ...item, externalRef: { channel: "C9", ts: "1.2" } }, "hi"),
    ).rejects.toThrow(/channel_not_found/)
  })
})
