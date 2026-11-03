import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));

const { classifyUrl } = await import("./externalLinks");

const ORIGIN = "http://localhost:4000";

describe("classifyUrl", () => {
  it("keeps the app's own pages in the window", () => {
    expect(classifyUrl("http://localhost:4000/runs/abc", ORIGIN)).toBe("internal");
  });

  it("sends other web origins to the browser", () => {
    expect(classifyUrl("https://github.com/ZibbyKarel/z.i.b.b.y/pull/1", ORIGIN)).toBe("external");
    expect(classifyUrl("http://localhost:3000/", ORIGIN)).toBe("external");
    expect(classifyUrl("mailto:someone@example.com", ORIGIN)).toBe("external");
  });

  it("drops non-web schemes and garbage", () => {
    expect(classifyUrl("file:///etc/passwd", ORIGIN)).toBe("blocked");
    expect(classifyUrl("javascript:alert(1)", ORIGIN)).toBe("blocked");
    expect(classifyUrl("not a url", ORIGIN)).toBe("blocked");
  });
});
