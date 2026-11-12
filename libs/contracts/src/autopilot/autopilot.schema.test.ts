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
  global: {
    autoImplement: true,
    autoReview: false,
    autoAddressComments: false,
    autoCommunicate: false,
    autoFixCi: false,
  },
  companies: { shoptet: { autoReview: true } },
  teams: { devrel: { autoReview: false, autoAddressComments: true } },
};

describe("resolveAutopilotAutomation", () => {
  it("resolves the tree while off too (off only re-arms the approval gates)", () => {
    const all = {
      autoImplement: true,
      autoReview: true,
      autoAddressComments: true,
      autoCommunicate: true,
      autoFixCi: true,
    };
    expect(
      resolveAutopilotAutomation({ level: "off", automation: { ...tree, global: all } }, {}),
    ).toEqual(all);
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
      autoCommunicate: false,
      autoFixCi: false,
    });
    expect(resolveAutopilotAutomation(s, { companyId: "shoptet", teamId: "frontend" })).toEqual({
      autoImplement: true,
      autoReview: true,
      autoAddressComments: false,
      autoCommunicate: false,
      autoFixCi: false,
    });
    expect(resolveAutopilotAutomation(s, { teamId: "gone" })).toEqual(tree.global);
  });
});

describe("autoFixCi", () => {
  it("defaults to false for trees written before it existed, and is overridable per node", () => {
    const legacy: Record<string, boolean> = { ...NO_AUTOMATION };
    delete legacy.autoFixCi;
    expect(AutomationTogglesSchema.parse(legacy).autoFixCi).toBe(false);
    const s = {
      level: "full" as const,
      automation: { ...tree, companies: { shoptet: { autoFixCi: true } } },
    };
    expect(resolveAutopilotAutomation(s, {}).autoFixCi).toBe(false);
    expect(resolveAutopilotAutomation(s, { companyId: "shoptet" }).autoFixCi).toBe(true);
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

describe("resolveAutopilotAutomation copy", () => {
  it("returns a fresh object without a tree, never the shared constant", () => {
    const a = resolveAutopilotAutomation({ level: "off" }, {});
    expect(a).toEqual(NO_AUTOMATION);
    expect(a).not.toBe(NO_AUTOMATION);
  });
});
