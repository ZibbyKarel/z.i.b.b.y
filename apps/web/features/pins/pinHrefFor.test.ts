import { describe, expect, it } from "vitest";
import { pinHrefFor } from "./pinHrefFor";

describe("pinHrefFor", () => {
  it("returns the bare pathname when there's no search", () => {
    expect(pinHrefFor("/workforce/agents", "")).toBe("/workforce/agents");
  });

  it("keeps non-approval search params", () => {
    expect(pinHrefFor("/workforce/agents", "?tab=active")).toBe("/workforce/agents?tab=active");
  });

  it("drops the transient approval param", () => {
    expect(pinHrefFor("/workforce/agents", "?approval=123")).toBe("/workforce/agents");
  });

  it("drops only approval, keeping the rest", () => {
    expect(pinHrefFor("/workforce/agents", "?approval=123&tab=active")).toBe(
      "/workforce/agents?tab=active",
    );
  });
});
