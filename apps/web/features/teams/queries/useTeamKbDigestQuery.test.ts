import { describe, expect, it } from "vitest";
import { isNoKbError } from "./useTeamKbDigestQuery";

describe("isNoKbError", () => {
  it("is true only for a 404", () => {
    expect(isNoKbError({ status: 404, body: {} })).toBe(true);
    expect(isNoKbError({ status: 500 })).toBe(false);
    expect(isNoKbError(new Error("x"))).toBe(false);
    expect(isNoKbError(null)).toBe(false);
    expect(isNoKbError("404")).toBe(false);
  });
});
