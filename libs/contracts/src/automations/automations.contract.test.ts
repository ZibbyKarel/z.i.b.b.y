import { describe, expect, it } from "vitest";
import { AutomationSchema, automationsContract } from "../index";

describe("automationsContract", () => {
  it("exposes CRUD + trigger under /api/automations", () => {
    expect(automationsContract.createAutomation.path).toBe("/api/automations");
    expect(automationsContract.triggerAutomation.path).toBe("/api/automations/:id/trigger");
    expect(automationsContract.updateAutomation.method).toBe("PATCH");
  });

  it("exposes a search route declared before the `:id` route", () => {
    expect(automationsContract.searchAutomations.method).toBe("GET");
    expect(automationsContract.searchAutomations.path).toBe("/api/automations/search");
    const keys = Object.keys(automationsContract);
    expect(keys.indexOf("searchAutomations")).toBeLessThan(keys.indexOf("getAutomation"));
  });
});

describe("automation schema", () => {
  it("accepts a cron→pipeline and an event→agent automation", () => {
    expect(
      AutomationSchema.safeParse({
        id: "nightly",
        trigger: { type: "cron", expr: "0 3 * * *" },
        target: { type: "pipeline", pipelineId: "release" },
        enabled: true,
      }).success,
    ).toBe(true);
    expect(
      AutomationSchema.safeParse({
        id: "on-push",
        trigger: { type: "event", event: "git.push" },
        target: { type: "agent", agentId: "reviewer", prompt: "review it" },
        enabled: false,
      }).success,
    ).toBe(true);
  });

  it("accepts a briefing target (no agent/pipeline picker)", () => {
    expect(
      AutomationSchema.safeParse({
        id: "morning-briefing",
        trigger: { type: "cron", expr: "0 7 * * *" },
        target: { type: "briefing" },
        enabled: true,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown trigger or target type", () => {
    expect(
      AutomationSchema.safeParse({
        id: "x",
        trigger: { type: "interval", every: 5 },
        target: { type: "agent", agentId: "a" },
        enabled: true,
      }).success,
    ).toBe(false);
  });
});
