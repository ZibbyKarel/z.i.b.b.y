import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ActivityEntry, WebPushSubscription } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggerService } from "../shared/logging/logger.service";
import type { ActivityEventsService } from "../activity/activity-events.service";
import type { OperatorChannelStore } from "../operator-channel/operator-channel.store";
import type { OperatorEventLookups } from "../operator-channel/operator-events";
import { WebPushNotifier, type WebPushSender } from "./web-push.notifier";
import { WebPushStore } from "./web-push.store";

const sub = (n: number): WebPushSubscription => ({
  endpoint: `https://push.example/${n}`,
  keys: { p256dh: "p", auth: "a" },
});

let seq = 0;
const entry = (kind: ActivityEntry["kind"], summary = "Ship it?"): ActivityEntry => ({
  id: `act_${++seq}`,
  at: "2026-11-04T12:00:00.000Z",
  kind,
  summary,
  refs: {},
});

const lookups = {} as OperatorEventLookups;
const settings = { readSettings: () => Promise.resolve({ locale: "en" }) } as OperatorChannelStore;

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "web-push-"));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

const build = (send: WebPushSender) => {
  const store = new WebPushStore(dir);
  const notifier = new WebPushNotifier(
    {} as ActivityEventsService,
    store,
    settings,
    lookups,
    send,
    {
      child: () => ({ warn: vi.fn() }),
    } as unknown as LoggerService,
  );
  return { store, notifier };
};

describe("WebPushNotifier", () => {
  it("pushes a Tier-3 approval-waiting to every subscription", async () => {
    const send = vi.fn<WebPushSender>().mockResolvedValue();
    const { store, notifier } = build(send);
    await store.add(sub(1));
    await store.add(sub(2));
    await notifier.onActivity(entry("approval-requested"));
    expect(send).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(send.mock.calls[0]?.[1] ?? "{}");
    expect(payload.body).toBe("Waiting for your decision: Ship it?");
    expect(payload.url).toBe("/governance/approvals");
    const log = await fs.readFile(path.join(dir, "deliveries.jsonl"), "utf8");
    expect(JSON.parse(log.trim())).toMatchObject({ kind: "approval-waiting", sent: 2, failed: 0 });
  });

  it("ignores Tier-2 events", async () => {
    const send = vi.fn<WebPushSender>().mockResolvedValue();
    const { store, notifier } = build(send);
    await store.add(sub(1));
    await notifier.onActivity(entry("briefing-generated"));
    expect(send).not.toHaveBeenCalled();
  });

  it("dedupes the same event within 24h", async () => {
    const send = vi.fn<WebPushSender>().mockResolvedValue();
    const { store, notifier } = build(send);
    await store.add(sub(1));
    const e = entry("approval-requested");
    await notifier.onActivity(e);
    await notifier.onActivity({ ...e });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops a subscription the push service reports gone (410) and keeps it on a 500", async () => {
    const send = vi
      .fn<WebPushSender>()
      .mockImplementation((s) =>
        Promise.reject(
          Object.assign(new Error("x"), { statusCode: s.endpoint.endsWith("/1") ? 410 : 500 }),
        ),
      );
    const { store, notifier } = build(send);
    await store.add(sub(1));
    await store.add(sub(2));
    await notifier.onActivity(entry("approval-requested"));
    expect((await store.list()).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });

  it("dedupe window expires after 24h", async () => {
    const send = vi.fn<WebPushSender>().mockResolvedValue();
    const { store, notifier } = build(send);
    await store.add(sub(1));
    const e = entry("approval-requested");
    await notifier.onActivity(e);
    const later = Date.now() + 25 * 60 * 60 * 1000;
    notifier.now = () => new Date(later);
    await notifier.onActivity(e);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retries an event whose push fully failed", async () => {
    const send = vi.fn<WebPushSender>().mockRejectedValueOnce(new Error("x")).mockResolvedValue();
    const { store, notifier } = build(send);
    await store.add(sub(1));
    const e = entry("approval-requested");
    await notifier.onActivity(e);
    await notifier.onActivity(e);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does nothing without subscriptions", async () => {
    const send = vi.fn<WebPushSender>().mockResolvedValue();
    const { notifier } = build(send);
    await notifier.onActivity(entry("approval-requested"));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("WebPushStore", () => {
  it("add twice with the same endpoint keeps one subscription", async () => {
    const store = new WebPushStore(dir);
    await store.add(sub(1));
    await store.add(sub(1));
    expect(await store.list()).toHaveLength(1);
  });

  it("vapid.json is mode 0600 and concurrent first calls agree", async () => {
    const store = new WebPushStore(dir);
    const [a, b] = await Promise.all([store.vapid(), store.vapid()]);
    expect(b).toEqual(a);
    expect((await fs.stat(path.join(dir, "vapid.json"))).mode & 0o777).toBe(0o600);
  });

  it("a failed first vapid() is retried, not cached", async () => {
    const blocker = path.join(dir, "blocker");
    await fs.writeFile(blocker, "x");
    const store = new WebPushStore(path.join(blocker, "sub")); // ENOTDIR
    await expect(store.vapid()).rejects.toThrow();
    await fs.rm(blocker);
    expect((await store.vapid()).publicKey).not.toBe("");
  });

  it("vapid() is stable across instances over the same dir", async () => {
    const a = await new WebPushStore(dir).vapid();
    const b = await new WebPushStore(dir).vapid();
    expect(b).toEqual(a);
    expect(a.publicKey).not.toBe("");
  });
});
