import { describe, expect, it } from "vitest";
import { pinHrefFor } from "./pinHrefFor";

describe("pinHrefFor", () => {
  it("returns the bare pathname when there's no search", () => {
    expect(pinHrefFor("/org/people", "")).toBe("/org/people");
  });

  it("keeps non-approval search params", () => {
    expect(pinHrefFor("/org/people", "?tab=active")).toBe("/org/people?tab=active");
  });

  it("drops the transient approval param", () => {
    expect(pinHrefFor("/org/people", "?approval=123")).toBe("/org/people");
  });

  it("drops only approval, keeping the rest", () => {
    expect(pinHrefFor("/org/people", "?approval=123&tab=active")).toBe("/org/people?tab=active");
  });
});
