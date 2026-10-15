import { describe, expect, it } from "vitest";
import { defaultPinLabelFor } from "./defaultPinLabelFor";

describe("defaultPinLabelFor", () => {
  it("humanizes the last path segment", () => {
    expect(defaultPinLabelFor("/system/settings/general")).toBe("General");
  });

  it("humanizes a dash-separated slug", () => {
    expect(defaultPinLabelFor("/companies/acme-corp")).toBe("Acme Corp");
  });

  it("humanizes an underscore-separated slug", () => {
    expect(defaultPinLabelFor("/teams/core_eng")).toBe("Core Eng");
  });

  it("ignores the search string", () => {
    expect(defaultPinLabelFor("/workforce/agents?tab=active")).toBe("Agents");
  });

  it("falls back to the href when there is no path segment", () => {
    expect(defaultPinLabelFor("/")).toBe("/");
  });

  it("humanizes a single top-level segment", () => {
    expect(defaultPinLabelFor("/dashboard")).toBe("Dashboard");
  });
});
