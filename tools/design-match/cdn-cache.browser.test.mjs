import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPage } from "./browser.mjs";
import { CDN_CACHE_URL_PREFIX, ensureCdnCache } from "./cdn-cache.mjs";
import { staticUrl, withStaticServer } from "./shoot.mjs";

// The brief's own flagship fixture: a Google Fonts CSS url with no extension
// in its path. This is the case the review found the cache could not actually
// serve — proof belongs here, in a real browser, not in a unit test that only
// checks the cached filename.
const STYLE_URL = "https://fonts.googleapis.com/css2?family=Geist";
const TARGET_COLOR = "rgb(18, 52, 86)";

let dir;
let cacheDir;
let htmlPath;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-cdn-cache-browser-"));
  cacheDir = path.join(dir, ".design-match", "cdn-cache");
  htmlPath = path.join(dir, "mockup.html");
  await fs.writeFile(
    htmlPath,
    `<!doctype html><html><head><link href="${STYLE_URL}" rel="stylesheet" /></head><body><p data-testid="target">hi</p></body></html>`,
    "utf8",
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("ensureCdnCache against real Chromium", () => {
  it("caches a stylesheet whose url has no file extension so Chromium actually applies it", async () => {
    // Entirely offline: the "remote" stylesheet is a stub response, never a
    // real network fetch. This is what a Google Fonts CSS response looks
    // like: ok, a text/css content-type, no extension anywhere in the url.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === "content-type" ? "text/css; charset=utf-8" : null),
      },
      arrayBuffer: async () => Buffer.from(`[data-testid="target"] { color: ${TARGET_COLOR}; }`),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { localHtmlPath } = await ensureCdnCache(htmlPath, cacheDir);

    // The real outcome: does the computed style from the cached stylesheet
    // actually land on the element? A filename assertion would only prove
    // the rename happened, not that the browser accepted the file.
    //
    // Served through the same two mounts `runMeasure` uses, because that is now
    // the only arrangement in which the rewritten html resolves at all — the
    // cache is named by its mount prefix, not by a path relative to the mockup.
    const color = await withStaticServer({ "/": dir, [CDN_CACHE_URL_PREFIX]: cacheDir }, (origin) =>
      withPage(async (page) => {
        await page.goto(staticUrl(origin, dir, localHtmlPath));
        return page.evaluate(
          (selector) => getComputedStyle(document.querySelector(selector)).color,
          '[data-testid="target"]',
        );
      }),
    );

    expect(color).toBe(TARGET_COLOR);
  });
});
