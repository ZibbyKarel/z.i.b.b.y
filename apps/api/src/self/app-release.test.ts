import { describe, expect, it, vi } from "vitest";
import { LatestDesktopReleaseCache, isNewer, pickLatestDesktopVersion } from "./app-release";

const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/ZibbyKarel/z.i.b.b.y/releases/tag/${tag}`,
  ...extra,
});

const RELEASES = [
  rel("desktop-v0.2.1"),
  rel("desktop-v0.3.0"),
  rel("desktop-v0.4.0", { prerelease: true }),
  rel("desktop-v0.5.0", { draft: true }),
  rel("v9.9.9"),
];

describe("pickLatestDesktopVersion", () => {
  it("picks the highest published desktop-v* release, ignoring drafts, prereleases and foreign tags", () => {
    expect(pickLatestDesktopVersion(RELEASES)).toEqual({
      version: "0.3.0",
      url: "https://github.com/ZibbyKarel/z.i.b.b.y/releases/tag/desktop-v0.3.0",
    });
  });

  it("returns undefined for non-array or garbage input", () => {
    expect(pickLatestDesktopVersion({ message: "API rate limit exceeded" })).toBeUndefined();
    expect(pickLatestDesktopVersion(null)).toBeUndefined();
    expect(
      pickLatestDesktopVersion([null, 42, { tag_name: 7 }, rel("desktop-vx")]),
    ).toBeUndefined();
  });
});

describe("isNewer", () => {
  it("compares major.minor.patch numerically", () => {
    expect(isNewer("0.3.0", "0.2.1")).toBe(true);
    expect(isNewer("0.2.1", "0.2.1")).toBe(false);
    expect(isNewer("0.10.0", "0.9.0")).toBe(true);
    expect(isNewer("0.2.0", "0.2.1")).toBe(false);
    expect(isNewer("garbage", "0.2.1")).toBe(false);
  });
});

describe("LatestDesktopReleaseCache", () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body } as Response);

  it("caches a successful lookup for 24 hours", async () => {
    let now = 0;
    const fetchImpl = ok(RELEASES);
    const cache = new LatestDesktopReleaseCache(fetchImpl, () => now);
    expect((await cache.get())?.version).toBe("0.3.0");
    now = 23 * 60 * 60 * 1000;
    await cache.get();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 25 * 60 * 60 * 1000;
    await cache.get();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces the next get() to refetch", async () => {
    const fetchImpl = ok(RELEASES);
    const cache = new LatestDesktopReleaseCache(fetchImpl, () => 0);
    await cache.get();
    cache.invalidate();
    await cache.get();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolves undefined (never throws) on a 403 rate limit or a network error", async () => {
    const forbidden = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
    expect(await new LatestDesktopReleaseCache(forbidden).get()).toBeUndefined();
    const offline = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    expect(await new LatestDesktopReleaseCache(offline).get()).toBeUndefined();
  });
});
