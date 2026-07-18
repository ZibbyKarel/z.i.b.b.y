import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { SentryMonitor } from "./sentry.monitor";

const INTEGRATION: Integration = {
  id: "acme-sentry",
  kind: "sentry",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "sentry", org: "acme", project: "backend", minLevel: "error" },
};

const CREDS = { token: "sntrys_x" };

const issue = (over: Record<string, unknown>) => ({
  id: "123",
  shortId: "BACKEND-1",
  title: "TypeError in checkout",
  culprit: "checkout()",
  level: "error",
  permalink: "https://sentry.io/organizations/acme/issues/123/",
  firstSeen: "2026-07-02T08:00:00Z",
  lastSeen: "2026-07-02T08:10:00Z",
  count: "12",
  ...over,
});

const fetchWith = (issues: unknown[], status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => issues,
  })) as unknown as typeof fetch;

describe("SentryMonitor", () => {
  it("wants every sentry integration (no streams gate)", () => {
    const monitor = new SentryMonitor(fetchWith([]));
    expect(monitor.wants(INTEGRATION)).toBe(true);
    expect(
      monitor.wants({
        ...INTEGRATION,
        kind: "slack",
        config: { kind: "slack", channels: [] },
      } as Integration),
    ).toBe(false);
  });

  it("fixture alert → event: one error-level unresolved issue becomes one MonitorAlert", async () => {
    const monitor = new SentryMonitor(fetchWith([issue({})]));
    const { events, cursor } = await monitor.poll(INTEGRATION, CREDS, undefined);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "sentry-acme-backend-123",
      kind: "error-unresolved",
      title: "Sentry: TypeError in checkout",
      occurredAt: "2026-07-02T08:00:00Z",
      url: "https://sentry.io/organizations/acme/issues/123/",
    });
    expect(events[0]?.detail).toContain("Culprit: checkout()");
    expect(cursor).toBe("2026-07-02T08:00:00Z");
  });

  it("actionability filter: a warning issue is emitted only when minLevel allows it", async () => {
    const warnIntegration: Integration = {
      ...INTEGRATION,
      config: { ...INTEGRATION.config, minLevel: "error" } as Integration["config"],
    };
    const monitorStrict = new SentryMonitor(fetchWith([issue({ level: "warning" })]));
    const { events: strict } = await monitorStrict.poll(warnIntegration, CREDS, undefined);
    expect(strict).toHaveLength(0);

    const looseIntegration: Integration = {
      ...INTEGRATION,
      config: { ...INTEGRATION.config, minLevel: "warning" } as Integration["config"],
    };
    const monitorLoose = new SentryMonitor(fetchWith([issue({ level: "warning" })]));
    const { events: loose } = await monitorLoose.poll(looseIntegration, CREDS, undefined);
    expect(loose).toHaveLength(1);
  });

  it("cursor/dedup: issues at or below the cursor firstSeen are skipped", async () => {
    const monitor = new SentryMonitor(
      fetchWith([
        issue({ id: "123", firstSeen: "2026-07-02T08:00:00Z" }), // == cursor → skipped
        issue({ id: "124", firstSeen: "2026-07-02T09:00:00Z" }),
      ]),
    );
    const { events, cursor } = await monitor.poll(INTEGRATION, CREDS, "2026-07-02T08:00:00Z");
    expect(events.map((e) => e.id)).toEqual(["sentry-acme-backend-124"]);
    expect(cursor).toBe("2026-07-02T09:00:00Z");
  });

  it("re-poll of the same page yields the same ids (watcher dedups via putNew)", async () => {
    const monitor = new SentryMonitor(fetchWith([issue({})]));
    const first = await monitor.poll(INTEGRATION, CREDS, undefined);
    const second = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(first.events.map((e) => e.id)).toEqual(second.events.map((e) => e.id));
  });

  it("fail-open: no token throws before any network call", async () => {
    const fetchImpl = fetchWith([]);
    const monitor = new SentryMonitor(fetchImpl);
    await expect(monitor.poll(INTEGRATION, { password: "x" }, undefined)).rejects.toThrow(
      "no sentry token",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fail-open: 401/403/429 throw (the watcher's retry/backoff owns it)", async () => {
    for (const status of [401, 403, 429]) {
      const monitor = new SentryMonitor(fetchWith([], status));
      await expect(monitor.poll(INTEGRATION, CREDS, undefined)).rejects.toThrow();
    }
  });

  it("malformed JSON / missing fields are tolerant-parsed, no crash", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ notAnArray: true }),
    })) as unknown as typeof fetch;
    const monitor = new SentryMonitor(fetchImpl);
    const { events } = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(events).toEqual([]);
  });

  it("slug sanitization: an org/project slug with a / or : produces a valid event id", async () => {
    const weirdIntegration: Integration = {
      ...INTEGRATION,
      config: { kind: "sentry", org: "acme/eu", project: "back:end", minLevel: "error" },
    };
    const monitor = new SentryMonitor(fetchWith([issue({})]));
    const { events } = await monitor.poll(weirdIntegration, CREDS, undefined);
    expect(events[0]?.id).toBe("sentry-acme-eu-back-end-123");
    expect(events[0]?.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
  });

  it("does not return a status snapshot (v1 omits it — no clean red/green for Sentry)", async () => {
    const monitor = new SentryMonitor(fetchWith([issue({})]));
    const result = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(result.status).toBeUndefined();
  });
});
