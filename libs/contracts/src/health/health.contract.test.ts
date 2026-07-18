import { describe, expect, it } from "vitest";
import { HealthSchema, WatcherHealthSchema, healthContract } from "../index";

describe("healthContract", () => {
  it("exposes a GET /api/health route returning 200", () => {
    expect(healthContract.getHealth.method).toBe("GET");
    expect(healthContract.getHealth.path).toBe("/api/health");
    expect(healthContract.getHealth.responses).toHaveProperty("200");
  });
});

describe("health schema", () => {
  it("accepts a well-formed ok payload with the claude preflight verdict + subsystems", () => {
    const parsed = HealthSchema.safeParse({
      status: "ok",
      uptime: 12.3,
      timestamp: new Date().toISOString(),
      claude: { ok: true, version: "1.2.3 (Claude Code)" },
      subsystems: [
        { name: "backend", status: "ok" },
        { name: "vault", status: "ok" },
        { name: "integrations", status: "ok" },
        { name: "scheduler", status: "ok", detail: "last tick 2026-06-17T00:00:00.000Z" },
      ],
      watchers: [
        {
          id: "channel",
          status: "ok",
          tickMs: 30000,
          lastTickAt: new Date().toISOString(),
          ageMs: 1200,
        },
        { id: "scheduler", status: "disabled", tickMs: 0 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a degraded payload carrying the failure reason + a down subsystem", () => {
    const parsed = HealthSchema.safeParse({
      status: "degraded",
      uptime: 12.3,
      timestamp: new Date().toISOString(),
      claude: { ok: false, reason: "missing" },
      subsystems: [{ name: "vault", status: "down", detail: "ENOENT" }],
      watchers: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown subsystem name or status", () => {
    const base = {
      status: "ok",
      uptime: 1,
      timestamp: new Date().toISOString(),
      claude: { ok: true },
      watchers: [],
    };
    expect(
      HealthSchema.safeParse({ ...base, subsystems: [{ name: "db", status: "ok" }] }).success,
    ).toBe(false);
    expect(
      HealthSchema.safeParse({ ...base, subsystems: [{ name: "vault", status: "weird" }] }).success,
    ).toBe(false);
  });

  it("rejects an unknown status, a negative uptime, a non-ISO timestamp, or a missing claude", () => {
    const claude = { ok: true };
    expect(
      HealthSchema.safeParse({
        status: "down",
        uptime: 1,
        timestamp: new Date().toISOString(),
        claude,
      }).success,
    ).toBe(false);
    expect(
      HealthSchema.safeParse({
        status: "ok",
        uptime: -1,
        timestamp: new Date().toISOString(),
        claude,
      }).success,
    ).toBe(false);
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: 1, timestamp: "not-a-date", claude }).success,
    ).toBe(false);
    expect(
      HealthSchema.safeParse({ status: "ok", uptime: 1, timestamp: new Date().toISOString() })
        .success,
    ).toBe(false);
  });

  it("requires watchers (F6c) — a payload without the array no longer parses", () => {
    const parsed = HealthSchema.safeParse({
      status: "ok",
      uptime: 1,
      timestamp: new Date().toISOString(),
      claude: { ok: true },
      subsystems: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("WatcherHealthSchema parses each status and rejects unknown ids", () => {
    expect(
      WatcherHealthSchema.safeParse({
        id: "task-scheduler",
        status: "stale",
        tickMs: 60000,
        lastTickAt: new Date().toISOString(),
        ageMs: 200000,
        detail: "last poll failed: ETIMEDOUT",
      }).success,
    ).toBe(true);
    expect(
      WatcherHealthSchema.safeParse({ id: "limit-resume", status: "disabled", tickMs: 0 }).success,
    ).toBe(true);
    expect(
      WatcherHealthSchema.safeParse({ id: "goal-loop", status: "ok", tickMs: 1000 }).success,
    ).toBe(false);
    expect(
      WatcherHealthSchema.safeParse({ id: "channel", status: "down", tickMs: 1000 }).success,
    ).toBe(false);
  });
});
