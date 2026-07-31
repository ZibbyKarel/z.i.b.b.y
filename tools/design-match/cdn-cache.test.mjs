import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureCdnCache } from "./cdn-cache.mjs";

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
});
