import { describe, expect, it } from "vitest";
import { DESIGN_MATCH_VERSION } from "./version.mjs";

describe("design-match scaffold", () => {
  it("exposes a semver version string", () => {
    expect(DESIGN_MATCH_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
