import { describe, expect, it } from "vitest";
import { normalizeRemote, redactRemote } from "./self-remote";

describe("normalizeRemote", () => {
  it.each([
    "git@github.com:ZibbyKarel/z.i.b.b.y.git",
    "git@GitHub.com:ZibbyKarel/z.i.b.b.y",
    "ssh://git@github.com/ZibbyKarel/z.i.b.b.y.git",
    "ssh://git@github.com:22/ZibbyKarel/z.i.b.b.y",
    "https://github.com/ZibbyKarel/z.i.b.b.y",
    "https://github.com/ZibbyKarel/z.i.b.b.y.git",
    "https://github.com/ZibbyKarel/z.i.b.b.y/",
    "https://user:tok@GITHUB.com/ZibbyKarel/z.i.b.b.y.git",
  ])("maps %s to host/owner/repo", (url) => {
    expect(normalizeRemote(url)).toBe("github.com/ZibbyKarel/z.i.b.b.y");
  });

  it("keeps different repos/hosts apart", () => {
    expect(normalizeRemote("git@github.com:me/a.git")).not.toBe(
      normalizeRemote("git@github.com:me/b.git"),
    );
    expect(normalizeRemote("git@gitlab.com:me/a.git")).not.toBe(
      normalizeRemote("git@github.com:me/a.git"),
    );
  });

  it("returns undefined for empty or unparseable input", () => {
    expect(normalizeRemote(undefined)).toBeUndefined();
    expect(normalizeRemote("")).toBeUndefined();
    expect(normalizeRemote("not a remote")).toBeUndefined();
  });
});

describe("redactRemote", () => {
  it("drops https userinfo entirely", () => {
    expect(redactRemote("https://user:tok@github.com/me/z.git")).toBe(
      "https://github.com/me/z.git",
    );
    expect(redactRemote("https://tok@github.com/me/z.git")).toBe("https://github.com/me/z.git");
  });

  it("drops only the ssh password, keeping the account user", () => {
    expect(redactRemote("ssh://git:secret@github.com/me/z.git")).toBe(
      "ssh://git@github.com/me/z.git",
    );
  });

  it("leaves credential-free and scp-like remotes unchanged", () => {
    expect(redactRemote("https://github.com/me/z.git")).toBe("https://github.com/me/z.git");
    expect(redactRemote("git@github.com:me/z.git")).toBe("git@github.com:me/z.git");
  });
});
