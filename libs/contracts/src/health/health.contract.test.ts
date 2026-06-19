import { describe, expect, it } from "vitest";
import { HealthSchema, healthContract } from "../index";

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
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown subsystem name or status", () => {
    const base = {
      status: "ok",
      uptime: 1,
      timestamp: new Date().toISOString(),
      claude: { ok: true },
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
});
