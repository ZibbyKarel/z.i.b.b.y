import { describe, expect, it } from "vitest";
import { DeleteResponseSchema, EmptyBodySchema } from "../common.schema";
import { AutomationSchema, automationsContract } from "../index";

describe("automationsContract", () => {
  it("exposes CRUD + trigger under /api/automations", () => {
    expect(automationsContract.createAutomation.path).toBe("/api/automations");
    expect(automationsContract.triggerAutomation.path).toBe("/api/automations/:id/trigger");
    expect(automationsContract.updateAutomation.method).toBe("PATCH");
  });

  it("deleteAutomation's 200 response IS the shared DeleteResponseSchema (T11 dedup, finding #9)", () => {
    expect(automationsContract.deleteAutomation.responses[200]).toBe(DeleteResponseSchema);
  });

  it("triggerAutomation's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(automationsContract.triggerAutomation.body).toBe(EmptyBodySchema);
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
        trigger: { type: "event", events: ["git.push", "pr.opened"] },
        target: { type: "agent", agentId: "reviewer" },
        prompt: "review it",
        enabled: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an event trigger with an unknown event or an empty list", () => {
    expect(
      AutomationSchema.safeParse({
        id: "x",
        trigger: { type: "event", events: ["not.a.real.event"] },
        target: { type: "briefing" },
        enabled: true,
      }).success,
    ).toBe(false);
    expect(
      AutomationSchema.safeParse({
        id: "y",
        trigger: { type: "event", events: [] },
        target: { type: "briefing" },
        enabled: true,
      }).success,
    ).toBe(false);
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

  it("F4c: accepts a self-knowledge target and round-trips it", () => {
    const parsed = AutomationSchema.safeParse({
      id: "self-knowledge-refresh",
      trigger: { type: "cron", expr: "30 3 * * *" },
      target: { type: "self-knowledge" },
      enabled: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.target).toEqual({ type: "self-knowledge" });
    }
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
    expect(
      AutomationSchema.safeParse({
        id: "y",
        trigger: { type: "cron", expr: "0 3 * * *" },
        target: { type: "nonsense-target" },
        enabled: true,
      }).success,
    ).toBe(false);
  });

  describe("Phase 116b — the `task` (prompt automation) target", () => {
    it("accepts a bare task target (text only — classifier/orchestrator decides at fire time)", () => {
      expect(
        AutomationSchema.safeParse({
          id: "nightly-audit",
          trigger: { type: "cron", expr: "0 2 * * *" },
          target: { type: "task", text: "audit the repo for stale deps" },
          enabled: true,
        }).success,
      ).toBe(true);
    });

    it("accepts a task target carrying an explicit @-mentioned target, attachments, output and toolGrants", () => {
      expect(
        AutomationSchema.safeParse({
          id: "nightly-audit",
          trigger: { type: "cron", expr: "0 2 * * *" },
          target: {
            type: "task",
            text: "audit the repo for stale deps",
            target: { kind: "pipeline", id: "code-audit", name: "Code audit" },
            attachmentSetId: "set_abc123",
            output: { type: "pr" },
            toolGrants: ["web_search"],
          },
          enabled: true,
        }).success,
      ).toBe(true);
    });

    it("rejects a task target with empty text", () => {
      expect(
        AutomationSchema.safeParse({
          id: "x",
          trigger: { type: "cron", expr: "0 2 * * *" },
          target: { type: "task", text: "" },
          enabled: true,
        }).success,
      ).toBe(false);
    });
  });
});
