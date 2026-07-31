import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectRemoteUrls, ensureCdnCache } from "./cdn-cache.mjs";

const REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.development.js";
const cacheFileFor = (cacheDir, url) =>
  path.join(cacheDir, `${createHash("sha1").update(url).digest("hex").slice(0, 12)}.js`);

let dir;
let cacheDir;
let htmlPath;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-cdn-cache-"));
  cacheDir = path.join(dir, ".design-match", "cdn-cache");
  htmlPath = path.join(dir, "mockup.html");
  await fs.writeFile(htmlPath, `<script src="${REACT_URL}"></script>`, "utf8");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("collectRemoteUrls", () => {
  // Every mockup in design/ opens with these two hints. A `preconnect` href is
  // an ORIGIN to warm a socket to, not a resource — fetching it 404s and used
  // to abort the whole run before the browser even launched.
  it("skips link relations that name an origin rather than a resource", () => {
    const html = `
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link rel="dns-prefetch" href="https://cdn.example.com" />
    `;
    expect(collectRemoteUrls(html)).toEqual([]);
  });

  it("keeps the link relations that do name a resource", () => {
    const html = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist" />
      <link rel="preload" as="font" href="https://fonts.gstatic.com/s/geist.woff2" />
      <link rel="modulepreload" href="https://cdn.example.com/app.mjs" />
      <link rel="shortcut icon" href="https://cdn.example.com/favicon.ico" />
    `;
    expect(collectRemoteUrls(html)).toEqual([
      "https://fonts.googleapis.com/css2?family=Geist",
      "https://fonts.gstatic.com/s/geist.woff2",
      "https://cdn.example.com/app.mjs",
      "https://cdn.example.com/favicon.ico",
    ]);
  });

  // An unknown relation is not cached rather than aborting the run: the
  // allow-list fails towards "this run reaches the network", which the
  // emptiness guard would catch, not towards exit 3 on a hint.
  it("skips a link relation it has never heard of instead of trying to fetch it", () => {
    expect(collectRemoteUrls(`<link rel="canonical" href="https://example.com/page" />`)).toEqual(
      [],
    );
  });

  it("never treats an <a href> as a resource to cache", () => {
    const html = `<a href="https://example.com/docs">docs</a>`;
    expect(collectRemoteUrls(html)).toEqual([]);
  });

  it("still collects a remote script src", () => {
    const html = `<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin="anonymous"></script>`;
    expect(collectRemoteUrls(html)).toEqual([
      "https://unpkg.com/react@18.3.1/umd/react.development.js",
    ]);
  });

  it("ignores a url that only appears inside inline script text", () => {
    const html = `<script>const link = 'href="https://example.com/not-a-tag.js"';</script>`;
    expect(collectRemoteUrls(html)).toEqual([]);
  });
});

describe("ensureCdnCache", () => {
  it("downloads a remote url once, caches it under cacheDir, and rewrites the html to a local path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from("window.React = {};"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureCdnCache(htmlPath, cacheDir);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toEqual([REACT_URL]);
    const cached = await fs.readFile(cacheFileFor(cacheDir, REACT_URL), "utf8");
    expect(cached).toBe("window.React = {};");
    const rewritten = await fs.readFile(result.localHtmlPath, "utf8");
    expect(rewritten).not.toContain(REACT_URL);
    expect(rewritten).toContain(".design-match");
  });

  it("never reaches the network for a mockup whose only remote references are preconnect hints", async () => {
    await fs.writeFile(
      htmlPath,
      `<link rel="preconnect" href="https://fonts.googleapis.com" />
       <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
      "utf8",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureCdnCache(htmlPath, cacheDir);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.downloaded).toEqual([]);
    // The hint is left in the html untouched — it is harmless, and rewriting it
    // to a local path would be a lie about what it is.
    const rewritten = await fs.readFile(result.localHtmlPath, "utf8");
    expect(rewritten).toContain('href="https://fonts.googleapis.com"');
  });

  it("does not re-download a url whose cache entry already exists", async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFileFor(cacheDir, REACT_URL), "cached already", "utf8");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureCdnCache(htmlPath, cacheDir);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.downloaded).toEqual([]);
  });

  it("throws a Czech, cause-naming error on HTTP failure instead of caching a stand-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCdnCache(htmlPath, cacheDir)).rejects.toThrow(/nelze stáhnout.*503/);
    await expect(fs.access(cacheFileFor(cacheDir, REACT_URL))).rejects.toThrow();
  });

  it("never leaves a half-written cache entry behind when the write is interrupted mid-flight", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from("window.React = {};"),
    });
    vi.stubGlobal("fetch", fetchMock);
    const realWriteFile = fs.writeFile;
    // A real "crash mid-write": whatever path the code under test hands to
    // writeFile actually receives a truncated buffer on disk before the
    // rejection — this is what an interrupted process leaves behind, unlike a
    // pure mock rejection which never touches the filesystem at all.
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockImplementationOnce(async (file, data) => {
      await realWriteFile(file, data.slice(0, 3));
      throw new Error("simulated crash mid-write");
    });

    await expect(ensureCdnCache(htmlPath, cacheDir)).rejects.toThrow("simulated crash mid-write");
    // The final cache filename must never exist half-written — only a fully
    // written file may ever occupy that path, or a later run would treat a
    // corrupt fragment as a valid cache hit and serve it forever.
    await expect(fs.access(cacheFileFor(cacheDir, REACT_URL))).rejects.toThrow();

    writeFileSpy.mockRestore();
    const result = await ensureCdnCache(htmlPath, cacheDir);
    expect(result.downloaded).toEqual([REACT_URL]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the cached file from the response's content-type, not the url path, when the url has no extension", async () => {
    // The brief's own flagship fixture: a Google Fonts css url with no
    // extension anywhere in its path. The url-derived name would fall back
    // to .txt, which Chromium refuses to apply as a stylesheet — see
    // cdn-cache.browser.test.mjs for the browser-level proof of that failure.
    // This test only proves the filename picks up ".css" from the header.
    const styleUrl = "https://fonts.googleapis.com/css2?family=Geist";
    await fs.writeFile(htmlPath, `<link href="${styleUrl}" rel="stylesheet" />`, "utf8");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === "content-type" ? "text/css; charset=utf-8" : null),
      },
      arrayBuffer: async () => Buffer.from("body { color: red; }"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureCdnCache(htmlPath, cacheDir);

    const entries = await fs.readdir(cacheDir);
    expect(entries.some((name) => name.endsWith(".css"))).toBe(true);
    expect(entries.some((name) => name.endsWith(".txt"))).toBe(false);
  });

  it("rejects a zero-length body instead of caching it as a valid entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.alloc(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCdnCache(htmlPath, cacheDir)).rejects.toThrow(/prázdný/);
    const entries = await fs.readdir(cacheDir).catch(() => []);
    expect(entries).toEqual([]);
  });

  it("cleans up the temp file when the write itself throws, without masking the original error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from("window.React = {};"),
    });
    vi.stubGlobal("fetch", fetchMock);
    // The tmp file's own write succeeds and lands fully on disk (unlike the
    // mid-write-crash test above); it's the rename onto the final path that
    // fails. This is the debris scenario: a fully-written orphan left behind
    // because nothing ever removes it on the failure path.
    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));

    await expect(ensureCdnCache(htmlPath, cacheDir)).rejects.toThrow("disk full");

    renameSpy.mockRestore();
    const entries = await fs.readdir(cacheDir);
    expect(entries.some((name) => name.includes(".tmp-"))).toBe(false);
  });

  it("surfaces a non-missing error from the cache-hit check instead of silently re-downloading", async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    // If the error were swallowed, the loop would fall through to download
    // and this mock would let it succeed silently — masking the bug.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from("window.React = {};"),
    });
    vi.stubGlobal("fetch", fetchMock);
    const permissionError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const readdirSpy = vi.spyOn(fs, "readdir").mockRejectedValueOnce(permissionError);

    await expect(ensureCdnCache(htmlPath, cacheDir)).rejects.toThrow("permission denied");
    expect(fetchMock).not.toHaveBeenCalled();

    readdirSpy.mockRestore();
  });
});
