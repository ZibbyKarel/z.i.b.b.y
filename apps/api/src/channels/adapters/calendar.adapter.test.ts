import { generateKeyPairSync } from "node:crypto"
import type { Integration } from "@zibby/contracts"
import { describe, expect, it, vi } from "vitest"
import { CalendarChannelAdapter } from "./calendar.adapter"

const cal: Integration = {
  id: "acme-cal",
  kind: "calendar",
  projectId: "acme-app",
  enabled: true,
  config: { kind: "calendar", calendarId: "primary", lookaheadDays: 14 },
  status: "disconnected",
  hasCredentials: true,
}

/** A real RS256 key so the adapter's JWT signing runs for real (only fetch is mocked). */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const saKey = JSON.stringify({
  client_email: "zibby@acme.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
})
const creds = { token: saKey }

/** Mock fetch that returns each queued body in order (token exchange, then API call). */
function sequenceFetch(...bodies: Array<{ body: unknown; status?: number }>): typeof fetch {
  const queue = [...bodies]
  return vi.fn(async () => {
    const next = queue.shift() ?? { body: {} }
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
}

describe("CalendarChannelAdapter", () => {
  it("exchanges the SA key for a token, normalizes events and advances the cursor", async () => {
    const fetchImpl = sequenceFetch(
      { body: { access_token: "ya29.token" } },
      {
        body: {
          items: [
            {
              id: "evt1",
              summary: "Standup",
              status: "confirmed",
              updated: "2026-06-17T09:00:00.000Z",
              start: { dateTime: "2026-06-19T09:00:00.000Z" },
              organizer: { displayName: "Dana" },
            },
            {
              id: "evt2",
              summary: "Review",
              status: "confirmed",
              updated: "2026-06-17T10:00:00.000Z",
              start: { date: "2026-06-20" },
              creator: { email: "eli@acme.com" },
            },
          ],
        },
      },
    )
    const adapter = new CalendarChannelAdapter(fetchImpl)
    const { items, cursor } = await adapter.poll(cal, creds, undefined)

    expect(items.map((i) => i.id)).toEqual(["gcal-evt1", "gcal-evt2"])
    expect(items[0]!.externalRef).toMatchObject({ channel: "primary", messageId: "evt1" })
    expect(items[0]!.from).toBe("Dana")
    expect(items[0]!.text).toBe("[2026-06-19T09:00:00.000Z] Standup")
    expect(items[1]!.from).toBe("eli@acme.com")
    expect(cursor).toBe("2026-06-17T10:00:00.000Z")
  })

  it("skips cancelled events and passes the cursor as updatedMin", async () => {
    const fetchImpl = sequenceFetch(
      { body: { access_token: "ya29.token" } },
      { body: { items: [{ id: "evt3", status: "cancelled", updated: "2026-06-17T11:00:00.000Z" }] } },
    )
    const adapter = new CalendarChannelAdapter(fetchImpl)
    const { items } = await adapter.poll(cal, creds, "2026-06-17T10:00:00.000Z")
    expect(items).toEqual([])
    const eventsUrl = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string
    expect(eventsUrl).toContain("updatedMin=2026-06-17T10")
    expect(eventsUrl).toContain("singleEvents=true")
  })

  it("drains nextPageToken pages so the cursor never skips an un-read tail", async () => {
    const fetchImpl = sequenceFetch(
      { body: { access_token: "ya29.token" } },
      {
        body: {
          nextPageToken: "page2",
          items: [{ id: "evt1", status: "confirmed", updated: "2026-06-17T08:00:00.000Z", summary: "A" }],
        },
      },
      { body: { items: [{ id: "evt2", status: "confirmed", updated: "2026-06-17T12:00:00.000Z", summary: "B" }] } },
    )
    const adapter = new CalendarChannelAdapter(fetchImpl)
    const { items, cursor } = await adapter.poll(cal, creds, undefined)
    expect(items.map((i) => i.id)).toEqual(["gcal-evt1", "gcal-evt2"])
    // Cursor is the newest `updated` across BOTH pages, not just page 1.
    expect(cursor).toBe("2026-06-17T12:00:00.000Z")
    const secondPageUrl = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[2]![0] as string
    expect(secondPageUrl).toContain("pageToken=page2")
  })

  it("test maps the calendar lookup to a TestResult", async () => {
    const fetchImpl = sequenceFetch(
      { body: { access_token: "ya29.token" } },
      { body: { summary: "Karel's calendar" } },
    )
    const adapter = new CalendarChannelAdapter(fetchImpl)
    expect(await adapter.test(cal, creds)).toEqual({ ok: true, detail: "connected to Karel's calendar" })
  })

  it("test reports a malformed service-account key", async () => {
    const adapter = new CalendarChannelAdapter(sequenceFetch())
    expect(await adapter.test(cal, { token: "not-json" })).toEqual({
      ok: false,
      detail: "no service account key configured",
    })
  })

  it("surfaces a 429 rate limit and rejects send (read-only)", async () => {
    const limited = new CalendarChannelAdapter(
      sequenceFetch({ body: { access_token: "ya29.token" } }, { body: {}, status: 429 }),
    )
    await expect(limited.poll(cal, creds, undefined)).rejects.toThrow(/rate limited/)

    const item = {
      id: "gcal-evt1", integrationId: "acme-cal", kind: "calendar" as const,
      externalRef: { channel: "primary", messageId: "evt1" }, receivedAt: "2026-06-17T00:00:00.000Z",
      text: "x", raw: {}, state: "triaged" as const,
    }
    await expect(new CalendarChannelAdapter(sequenceFetch()).send(cal, creds, item, "hi")).rejects.toThrow(/read-only/)
  })
})
