import { describe, expect, it } from "vitest";
import { AutopilotStateSchema, SetAutopilotInputSchema, autopilotContract } from "../index";

describe("autopilotContract", () => {
  it("exposes GET and PUT /api/autopilot", () => {
    expect(autopilotContract.getAutopilot.path).toBe("/api/autopilot");
    expect(autopilotContract.setAutopilot.method).toBe("PUT");
  });

  it("accepts only off | full and rejects unknown keys", () => {
    expect(SetAutopilotInputSchema.safeParse({ level: "full" }).success).toBe(true);
    expect(SetAutopilotInputSchema.safeParse({ level: "half" }).success).toBe(false);
    expect(SetAutopilotInputSchema.safeParse({ level: "off", by: "operator" }).success).toBe(false);
    expect(AutopilotStateSchema.safeParse({ level: "off", sneaky: 1 }).success).toBe(false);
  });
});
