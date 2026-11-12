import { describe, expect, it } from "vitest";
import { isIgnoredCheck } from "./ci-checks";

describe("isIgnoredCheck", () => {
  it("matches exact names case-insensitively", () => {
    expect(isIgnoredCheck("Review approved by everyone", ["review APPROVED by everyone"])).toBe(
      true,
    );
    expect(isIgnoredCheck("Review approved by everyone 2", ["Review approved by everyone"])).toBe(
      false,
    );
  });
  it("treats /.../ as a case-insensitive regex", () => {
    expect(isIgnoredCheck("Review approved by x", ["/^review approved/"])).toBe(true);
    expect(isIgnoredCheck("build", ["/^review/"])).toBe(false);
  });
  it("an invalid regex matches nothing and never throws", () => {
    expect(isIgnoredCheck("build", ["/(/"])).toBe(false);
  });
  it("no patterns ignores nothing", () => {
    expect(isIgnoredCheck("build", undefined)).toBe(false);
    expect(isIgnoredCheck("build", [])).toBe(false);
  });
});
