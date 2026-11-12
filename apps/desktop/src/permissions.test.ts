import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ systemPreferences: { askForMediaAccess: vi.fn() } }));

const { isPermissionAllowed } = await import("./permissions");

const ORIGIN = "http://localhost:4000";

describe("isPermissionAllowed", () => {
  it("grants the microphone to the app's own origin", () => {
    expect(isPermissionAllowed("media", `${ORIGIN}/chat`, ORIGIN)).toBe(true);
    expect(isPermissionAllowed("media", ORIGIN, ORIGIN)).toBe(true);
  });

  it("denies the microphone to any other origin", () => {
    expect(isPermissionAllowed("media", "https://evil.example/", ORIGIN)).toBe(false);
    expect(isPermissionAllowed("media", "not a url", ORIGIN)).toBe(false);
  });

  it("denies clipboard-read (untrusted inbound content is rendered)", () => {
    expect(isPermissionAllowed("clipboard-read", `${ORIGIN}/`, ORIGIN)).toBe(false);
  });

  it("denies permissions the app does not need, even for its own origin", () => {
    expect(isPermissionAllowed("geolocation", `${ORIGIN}/`, ORIGIN)).toBe(false);
    expect(isPermissionAllowed("openExternal", `${ORIGIN}/`, ORIGIN)).toBe(false);
  });
});
