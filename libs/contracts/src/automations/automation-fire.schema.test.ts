import { describe, expect, it } from "vitest";
import {
  AUTOMATION_FIRES_KEEP,
  AutomationFireSchema,
  AutomationViewSchema,
  automationsContract,
} from "../index";

const running = {
  id: "fire_1700000000000_abcdef",
  automationId: "nightly",
  source: "cron",
  startedAt: "2026-11-12T08:00:00.000Z",
  status: "running",
};

const automation = {
  id: "nightly",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "gap-detect" },
  enabled: true,
};

describe("AutomationFireSchema", () => {
  it("parses a running fire without finishedAt", () => {
    expect(AutomationFireSchema.parse(running).finishedAt).toBeUndefined();
  });

  it("rejects an unknown status", () => {
    expect(AutomationFireSchema.safeParse({ ...running, status: "queued" }).success).toBe(false);
  });
});

describe("AutomationViewSchema", () => {
  it("accepts an automation without lastFire", () => {
    expect(AutomationViewSchema.parse(automation).lastFire).toBeUndefined();
  });

  it("accepts an automation with lastFire", () => {
    expect(AutomationViewSchema.parse({ ...automation, lastFire: running }).lastFire?.id).toBe(
      running.id,
    );
  });
});

describe("automation fire routes", () => {
  it("expose fires list and fire log under /api/automations/:id", () => {
    expect(automationsContract.listAutomationFires.path).toBe("/api/automations/:id/fires");
    expect(automationsContract.getAutomationFireLog.path).toBe(
      "/api/automations/:id/fires/:fireId/logs",
    );
    expect(AUTOMATION_FIRES_KEEP).toBe(50);
  });
});
