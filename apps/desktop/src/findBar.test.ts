import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

const { findRequest } = await import("./findBar");

describe("findRequest (todo-15)", () => {
  it("starts a new search session when the text changed", () => {
    expect(findRequest("", "foo", true)).toEqual({ forward: true, findNext: true });
    expect(findRequest("fo", "foo", true)).toEqual({ forward: true, findNext: true });
  });

  it("steps through matches of the same text in either direction", () => {
    expect(findRequest("foo", "foo", true)).toEqual({ forward: true, findNext: false });
    expect(findRequest("foo", "foo", false)).toEqual({ forward: false, findNext: false });
  });

  it("stops searching for empty text", () => {
    expect(findRequest("foo", "", true)).toBeNull();
  });
});
