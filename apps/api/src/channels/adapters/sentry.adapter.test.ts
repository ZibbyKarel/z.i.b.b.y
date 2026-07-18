import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { SentryChannelAdapter } from "./sentry.adapter";

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

const fetchWith = (status: number) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })) as unknown as typeof fetch;

describe("SentryChannelAdapter", () => {
  it("is readOnly", () => {
    expect(new SentryChannelAdapter().readOnly).toBe(true);
  });

  it("poll returns no items — alerts flow through the monitor watcher, not here", async () => {
    const adapter = new SentryChannelAdapter(fetchWith(200));
    const result = await adapter.poll(INTEGRATION, CREDS, undefined);
    expect(result).toEqual({ items: [], cursor: undefined });
  });

  it("test maps a 200 project lookup to ok:true", async () => {
    const adapter = new SentryChannelAdapter(fetchWith(200));
    const result = await adapter.test(INTEGRATION, CREDS);
    expect(result.ok).toBe(true);
  });

  it("test maps a 404 to ok:false", async () => {
    const adapter = new SentryChannelAdapter(fetchWith(404));
    const result = await adapter.test(INTEGRATION, CREDS);
    expect(result.ok).toBe(false);
  });

  it("test fails open with no token", async () => {
    const adapter = new SentryChannelAdapter(fetchWith(200));
    const result = await adapter.test(INTEGRATION, { password: "x" });
    expect(result).toEqual({ ok: false, detail: "no sentry token configured" });
  });

  it("send throws — never reached (readOnly short-circuits the reply surface)", async () => {
    const adapter = new SentryChannelAdapter();
    await expect(adapter.send()).rejects.toThrow("read-only");
  });
});
