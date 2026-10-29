import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_EVENTS,
  OperatorChannelSettingsInputSchema,
  OperatorChannelSettingsSchema,
  OperatorDeliveryEntrySchema,
  operatorChannelContract,
} from "../index";

describe("operatorChannelContract", () => {
  it("exposes status, settings, credentials and test routes under /api", () => {
    expect(operatorChannelContract.getOperatorChannelStatus.path).toBe(
      "/api/operator-channel/status",
    );
    expect(operatorChannelContract.setOperatorChannelSettings.method).toBe("PUT");
    expect(operatorChannelContract.setOperatorChannelCredential.path).toBe(
      "/api/operator-channel/credentials/:kind",
    );
    expect(operatorChannelContract.testOperatorChannel.method).toBe("POST");
  });
});

describe("operator-channel settings schema", () => {
  it("defaults to disabled, cs, every event but the briefing digest, approvals off", () => {
    const parsed = OperatorChannelSettingsSchema.parse({});
    expect(parsed).toEqual({
      enabled: false,
      transport: "slack",
      operatorUserIds: [],
      locale: "cs",
      notify: { events: DEFAULT_OPERATOR_EVENTS, maxPerHour: 20 },
      allowSlackApprovals: false,
    });
    expect(parsed.notify.events).not.toContain("briefing");
  });

  it("rejects unknown keys, a non-Slack user id and turning Slack approvals on", () => {
    expect(OperatorChannelSettingsSchema.safeParse({ sneaky: true }).success).toBe(false);
    expect(OperatorChannelSettingsSchema.safeParse({ operatorUserIds: ["karel"] }).success).toBe(
      false,
    );
    expect(OperatorChannelSettingsSchema.safeParse({ allowSlackApprovals: true }).success).toBe(
      false,
    );
  });

  it("validates quiet hours as HH:MM + tz", () => {
    const ok = { notify: { quietHours: { from: "22:00", to: "07:00", tz: "Europe/Prague" } } };
    expect(OperatorChannelSettingsSchema.safeParse(ok).success).toBe(true);
    const bad = { notify: { quietHours: { from: "25:00", to: "07:00", tz: "Europe/Prague" } } };
    expect(OperatorChannelSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it("the PUT input cannot set the bot-resolved dmChannelId", () => {
    expect(OperatorChannelSettingsInputSchema.safeParse({ dmChannelId: "D123" }).success).toBe(
      false,
    );
  });
});

describe("delivery entry schema", () => {
  it("accepts a sent entry and rejects an unknown status", () => {
    const entry = {
      ts: new Date().toISOString(),
      kind: "pr-opened",
      targetRef: "https://github.com/acme/app/pull/7",
      messageRef: "1700000000.000100",
      status: "sent",
    };
    expect(OperatorDeliveryEntrySchema.safeParse(entry).success).toBe(true);
    expect(OperatorDeliveryEntrySchema.safeParse({ ...entry, status: "maybe" }).success).toBe(
      false,
    );
  });
});
