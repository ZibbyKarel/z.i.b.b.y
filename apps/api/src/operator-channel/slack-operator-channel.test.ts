import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "./operator-channel.port";
import type { OperatorNotification } from "./operator-channel.port";
import { SlackOperatorChannel } from "./slack-operator-channel";

const TOKEN = "xoxb-test-token";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Fake Slack Web API routed by method; records each call's parsed JSON body. */
function fakeSlack(override?: (method: string) => Response | undefined) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const method = String(input).split("/").pop() ?? "";
    calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const custom = override?.(method);
    if (custom) return custom;
    switch (method) {
      case "auth.test":
        return json({ ok: true, team: "Zibby's" });
      case "conversations.open":
        return json({ ok: true, channel: { id: "DBOT1" } });
      case "chat.postMessage":
        return json({ ok: true, channel: "DBOT1", ts: "1700000000.000100" });
      default:
        return json({ ok: true });
    }
  }) as unknown as typeof fetch;
  return { channel: new SlackOperatorChannel(TOKEN, null, fetchImpl), calls };
}

const note: OperatorNotification = {
  kind: "pr-opened",
  tier: 2,
  headline: "PR opened: Fix login",
  lines: ["3 stages green"],
  links: [{ label: "Open PR", url: "https://github.com/acme/app/pull/7" }],
};

describe("SlackOperatorChannel", () => {
  it("connect() resolves the operator DM with conversations.open", async () => {
    const { channel, calls } = fakeSlack();
    expect(await channel.connect("U123")).toEqual({ workspace: "Zibby's", dmChannelId: "DBOT1" });
    expect(calls.find((c) => c.method === "conversations.open")?.body).toEqual({ users: "U123" });
  });

  it("send() posts Block Kit with link buttons plus a plain text fallback to the DM", async () => {
    const { channel, calls } = fakeSlack();
    await channel.connect("U123");
    expect(await channel.send(note)).toEqual({ channel: "DBOT1", ts: "1700000000.000100" });
    const post = calls.find((c) => c.method === "chat.postMessage")!.body;
    expect(post.channel).toBe("DBOT1");
    expect(post.text).toBe(
      "PR opened: Fix login\n3 stages green\nOpen PR: https://github.com/acme/app/pull/7",
    );
    expect(post.blocks).toContainEqual({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "link-0",
          text: { type: "plain_text", text: "Open PR" },
          url: "https://github.com/acme/app/pull/7",
        },
      ],
    });
  });

  it("send() before connect() refuses", async () => {
    await expect(fakeSlack().channel.send(note)).rejects.toThrow(/connect first/);
  });

  it("a 429 surfaces as RateLimitedError carrying Retry-After", async () => {
    const { channel } = fakeSlack((m) =>
      m === "chat.postMessage" ? json({ ok: false }, 429, { "retry-after": "3" }) : undefined,
    );
    await channel.connect("U123");
    const error = await channel.send(note).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterMs).toBe(3000);
  });

  it("a Slack error names the method and error, never the token", async () => {
    const { channel } = fakeSlack((m) =>
      m === "auth.test" ? json({ ok: false, error: "invalid_auth" }) : undefined,
    );
    const error = (await channel.connect("U123").catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("auth.test: invalid_auth");
    expect(error.message).not.toContain(TOKEN);
  });
});
