import { describe, expect, it } from "vitest";
import {
  AutomationTogglesSchema,
  type AutopilotAutomation,
  AutopilotStateSchema,
  NO_AUTOMATION,
  SetAutopilotInputSchema,
  resolveAutopilotAutomation,
} from "../index";

const tree: AutopilotAutomation = {
  global: { autoImplement: true, autoReview: false, autoAddressComments: false },
  companies: { shoptet: { autoReview: true } },
  teams: { devrel: { autoReview: false, autoAddressComments: true } },
};

describe("resolveAutopilotAutomation", () => {
  it("is all false while off, whatever the tree says", () => {
    const all = { autoImplement: true, autoReview: true, autoAddressComments: true };
    expect(
      resolveAutopilotAutomation({ level: "off", automation: { ...tree, global: all } }, {}),
    ).toEqual(NO_AUTOMATION);
  });

  it("is all false for full without a tree", () => {
    expect(resolveAutopilotAutomation({ level: "full" }, {})).toEqual(NO_AUTOMATION);
  });

  it("applies team > company > global", () => {
    const s = { level: "full" as const, automation: tree };
    expect(resolveAutopilotAutomation(s, { companyId: "shoptet", teamId: "devrel" })).toEqual({
      autoImplement: true,
      autoReview: false,
      autoAddressComments: true,
    });
    expect(resolveAutopilotAutomation(s, { companyId: "shoptet", teamId: "frontend" })).toEqual({
      autoImplement: true,
      autoReview: true,
      autoAddressComments: false,
    });
    expect(resolveAutopilotAutomation(s, { teamId: "gone" })).toEqual(tree.global);
  });
});

describe("autopilot automation schemas", () => {
  it("parses old state without automation and defaults the maps", () => {
    expect(AutopilotStateSchema.parse({ level: "full" })).toEqual({ level: "full" });
    const parsed = AutopilotStateSchema.parse({
      level: "full",
      automation: { global: NO_AUTOMATION },
    });
    expect(parsed.automation).toEqual({ global: NO_AUTOMATION, companies: {}, teams: {} });
    expect(
      SetAutopilotInputSchema.safeParse({ level: "full", automation: { global: NO_AUTOMATION } })
        .success,
    ).toBe(true);
  });

  it("rejects unknown toggle keys", () => {
    expect(AutomationTogglesSchema.safeParse({ ...NO_AUTOMATION, sneaky: true }).success).toBe(
      false,
    );
  });
});
