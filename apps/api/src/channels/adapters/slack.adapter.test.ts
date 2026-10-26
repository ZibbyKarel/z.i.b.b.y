import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { SlackChannelAdapter } from "./slack.adapter";

const ME = "UME";
const creds = { token: "xoxp-1" };

function slack(channels: string[] = []): Integration {
  return {
    id: "team-slack",
    kind: "slack",
    projectId: "acme-app",
    enabled: true,
    config: { kind: "slack", channels },
    status: "disconnected",
    hasCredentials: true,
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

interface World {
  dms?: Record<string, unknown[]>; // channel id -> history messages
  matches?: unknown[];
  auth?: Record<string, unknown>;
}

/** Fake Slack: routes by Web API method name; records every call. */
function fakeSlack(w: World = {}) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const method = url.pathname.split("/").pop();
    switch (method) {
      case "auth.test":
        return json({ ok: true, user_id: ME, user: "karel", team: "Acme", ...w.auth });
      case "users.conversations":
        return json({ ok: true, channels: Object.keys(w.dms ?? {}).map((id) => ({ id })) });
      case "conversations.history":
        return json({ ok: true, messages: w.dms?.[url.searchParams.get("channel") ?? ""] ?? [] });
      case "search.messages":
        return json({ ok: true, messages: { matches: w.matches ?? [] } });
      case "chat.getPermalink":
        return json({
          ok: true,
          permalink: `https://acme.slack.com/archives/${url.searchParams.get("channel")}/p${url.searchParams.get("message_ts")}`,
        });
      default:
        return json({ ok: false, error: "unknown_method" });
    }
  }) as unknown as typeof fetch;
  return { adapter: new ClockedAdapter(fetchImpl), calls, fetchImpl };
}

/** Adapter with a settable clock (DM sweep throttle + cursor-advance tests). */
class ClockedAdapter extends SlackChannelAdapter {
  clock = NOW_MS;
  protected override now(): number {
    return this.clock;
  }
}

const T1 = "1700000100.000200";
const T2 = "1700000200.000300";
const T3 = "1700000300.000400";
/** Well outside the mention leg's search-lag overlap behind T2. */
const T_OLD = "1699990000.000100";
const NOW_MS = 1_700_010_000_000;

describe("SlackChannelAdapter", () => {
  it("test() accepts a user token and rejects a bot token", async () => {
    const ok = fakeSlack();
    expect(await ok.adapter.test(slack(), creds)).toEqual({
      ok: true,
      detail: "authenticated as karel in Acme",
    });
    const botId = fakeSlack({ auth: { bot_id: "B1" } });
    expect((await botId.adapter.test(slack(), creds)).detail).toMatch(/user token/);
    const xoxb = fakeSlack();
    expect(await xoxb.adapter.test(slack(), { token: "xoxb-1" })).toEqual({
      ok: false,
      detail: "needs a Slack user token (xoxp-…), not a bot token",
    });
    const bad = new SlackChannelAdapter(
      vi.fn(async () => json({ ok: false, error: "invalid_auth" })) as unknown as typeof fetch,
    );
    expect(await bad.test(slack(), creds)).toEqual({ ok: false, detail: "invalid_auth" });
  });

  it("DM leg: ingests human messages, skips own/bot/system, adds permalink and ids", async () => {
    const { adapter, calls } = fakeSlack({
      dms: {
        D1: [
          { user: "UBOB", text: "ping", ts: T1 },
          { user: ME, text: "my reply", ts: T2 },
          { user: "UBOB", bot_id: "B1", text: "bot", ts: T2 },
          { subtype: "channel_join", user: "UBOB", ts: T2 },
        ],
      },
    });
    const { items, cursor } = await adapter.poll(slack(), creds, "1700000000.000000");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "D1-1700000100-000200",
      from: "UBOB",
      text: "ping",
      externalRef: { channel: "D1", ts: T1 },
      url: `https://acme.slack.com/archives/D1/p${T1}`,
    });
    // The cursor is the DM leg's high-water mark — every message seen, own ones included.
    expect(cursor).toBe(T2);
    const hist = calls.find((c) => c.pathname.endsWith("/conversations.history"))!;
    expect(hist.searchParams.get("oldest")).toBe("1700000000.000000");
  });

  it("mention leg: uses the search permalink, skips own/bot, cuts by ts > cursor - overlap", async () => {
    const { adapter, calls } = fakeSlack({
      matches: [
        {
          user: "UBOB",
          text: `hi <@${ME}>`,
          ts: T3,
          channel: { id: "C9" },
          permalink: "https://p/3",
        },
        { user: ME, text: `<@${ME}> self`, ts: T3, channel: { id: "C9" } },
        { user: "UBOB", bot_id: "B1", text: `<@${ME}>`, ts: T3, channel: { id: "C9" } },
        // indexed late but within the overlap behind the cursor → still ingested
        { user: "UBOB", text: `<@${ME}> lagged`, ts: T1, channel: { id: "C9" }, permalink: "p1" },
        { user: "UBOB", text: `<@${ME}> old`, ts: T_OLD, channel: { id: "C9" } },
      ],
    });
    const { items } = await adapter.poll(slack(), creds, T2);
    expect(items.map((i) => [i.id, i.url])).toEqual([
      ["C9-1700000300-000400", "https://p/3"],
      ["C9-1700000100-000200", "p1"],
    ]);
    expect(calls.some((c) => c.pathname.endsWith("/chat.getPermalink"))).toBe(false);
    const search = calls.find((c) => c.pathname.endsWith("/search.messages"))!;
    expect(search.searchParams.get("query")).toBe(`<@${ME}>`);
    expect(search.searchParams.get("sort")).toBe("timestamp");
  });

  it("config.channels narrows mentions only, never DMs", async () => {
    const world: World = {
      dms: { D1: [{ user: "UBOB", text: "dm", ts: T1 }] },
      matches: [
        { user: "UBOB", text: "in", ts: T2, channel: { id: "C1" }, permalink: "p1" },
        { user: "UBOB", text: "out", ts: T3, channel: { id: "C2" }, permalink: "p2" },
      ],
    };
    const { items } = await fakeSlack(world).adapter.poll(slack(["C1"]), creds, "1");
    expect(items.map((i) => i.externalRef.channel).sort()).toEqual(["C1", "D1"]);
    const all = await fakeSlack(world).adapter.poll(slack(), creds, "1");
    expect(all.items).toHaveLength(3);
  });

  it("de-dups a DM message that also mentions the operator", async () => {
    const { adapter } = fakeSlack({
      dms: { D1: [{ user: "UBOB", text: `<@${ME}> hey`, ts: T1 }] },
      matches: [
        { user: "UBOB", text: `<@${ME}> hey`, ts: T1, channel: { id: "D1" }, permalink: "p" },
      ],
    });
    const { items } = await adapter.poll(slack(), creds, "1");
    expect(items).toHaveLength(1);
  });

  it("a quiet DM sweep advances the cursor to the sweep time minus the overlap", async () => {
    const { adapter } = fakeSlack();
    const { cursor } = await adapter.poll(slack(), creds, T2);
    expect(cursor).toBe(String(NOW_MS / 1000 - 15 * 60));
  });

  it("throttles the DM sweep, never moves the cursor without one, caches the operator id", async () => {
    const { adapter, calls } = fakeSlack({
      matches: [{ user: "UBOB", text: `<@${ME}>`, ts: T3, channel: { id: "C9" }, permalink: "p" }],
    });
    const sweeps = () => calls.filter((c) => c.pathname.endsWith("/users.conversations")).length;
    await adapter.poll(slack(), creds, T2);
    adapter.clock += 60_000;
    const skipped = await adapter.poll(slack(), creds, T2);
    expect(sweeps()).toBe(1);
    expect(skipped.cursor).toBe(T2); // a mention alone never advances it
    expect(skipped.items).toHaveLength(1);
    adapter.clock += 60_000;
    await adapter.poll(slack(), creds, T2);
    expect(sweeps()).toBe(2);
    expect(calls.filter((c) => c.pathname.endsWith("/auth.test"))).toHaveLength(1);
  });

  it("first poll without a cursor only looks back ~24h", async () => {
    const { adapter, calls } = fakeSlack({ dms: { D1: [] } });
    await adapter.poll(slack(), creds, undefined);
    const oldest = Number(
      calls.find((c) => c.pathname.endsWith("/conversations.history"))!.searchParams.get("oldest"),
    );
    expect(oldest).toBe(NOW_MS / 1000 - 24 * 60 * 60);
  });

  it("surfaces a 429 as an error", async () => {
    const adapter = new SlackChannelAdapter(
      vi.fn(async (input: string | URL) =>
        String(input).includes("auth.test")
          ? json({ ok: true, user_id: ME })
          : json({ ok: false }, 429),
      ) as unknown as typeof fetch,
    );
    await expect(adapter.poll(slack(), creds, undefined)).rejects.toThrow(/rate limited/);
  });

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
    };
    const fetchImpl = vi.fn(async () => json({ ok: true })) as unknown as typeof fetch;
    await new SlackChannelAdapter(fetchImpl).send(slack(), creds, item, "on it");
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      channel: "C123",
      thread_ts: "1.2",
      text: "on it",
    });
    const failing = new SlackChannelAdapter(
      vi.fn(async () => json({ ok: false, error: "channel_not_found" })) as unknown as typeof fetch,
    );
    await expect(failing.send(slack(), creds, item, "hi")).rejects.toThrow(/channel_not_found/);
  });
});
