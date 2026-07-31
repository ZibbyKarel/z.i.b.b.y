import { describe, expect, it } from "vitest";
import { collectRemoteUrls, rewriteToCache } from "./cdn-cache.mjs";
import { fontPreflight } from "./preflight.mjs";

const HTML = `
<link href="https://fonts.googleapis.com/css2?family=Geist" rel="stylesheet" />
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script type="text/babel" src="zibby/data.jsx"></script>
`;

describe("collectRemoteUrls", () => {
  it("finds absolute urls and ignores relative ones", () => {
    expect(collectRemoteUrls(HTML)).toEqual([
      "https://fonts.googleapis.com/css2?family=Geist",
      "https://unpkg.com/react@18.3.1/umd/react.development.js",
    ]);
  });
});

describe("rewriteToCache", () => {
  it("swaps only the urls present in the manifest", () => {
    const out = rewriteToCache(HTML, {
      "https://unpkg.com/react@18.3.1/umd/react.development.js": ".cdn-cache/react.js",
    });
    expect(out).toContain('src=".cdn-cache/react.js"');
    expect(out).toContain("https://fonts.googleapis.com/css2?family=Geist");
    expect(out).toContain('src="zibby/data.jsx"');
  });
});

describe("fontPreflight", () => {
  it("passes when both sides resolve the same primary family", () => {
    const result = fontPreflight(["Geist", "JetBrains Mono"], ["Geist", "JetBrains Mono"]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Geist");
  });

  // D6 (task 15). The preflight used to join the WHOLE stack and string-compare
  // it, so these two — the exact pair observed on a real green-gate round —
  // parked the run at exit 2 with the pixel layer suppressed, leaving the loop
  // no progress signal at all. Nothing about what the browser renders was at
  // risk: it renders with the first family it can resolve, and that is
  // identical.
  it("passes when the primary family matches and only the fallback order differs", () => {
    const result = fontPreflight(
      ["Geist", "-apple-system", "system-ui", "sans-serif"],
      ["Geist", "system-ui", "-apple-system", "sans-serif"],
    );
    expect(result.ok).toBe(true);
  });

  // The narrowing must be stated, not silently assumed: a reader of report.md
  // must not take "font stack shodný" as a claim about the whole stack, because
  // the rest of it is not compared — and, per task 15, is not stable ground to
  // compare on (collectFontStacks dedupes in DOM-traversal order, not CSS order).
  it("says that only the primary family was compared, so the pass is not overclaimed", () => {
    const result = fontPreflight(["Geist", "Arial"], ["Geist", "Helvetica"]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("první");
  });

  it("fails and names both stacks when the primary family differs", () => {
    const result = fontPreflight(["Geist"], ["Inter"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });

  // A primary family present on one side and absent on the other is a genuine
  // mismatch, and must read as one rather than printing "undefined".
  it("fails when one side has no font family at all, without printing undefined", () => {
    const result = fontPreflight(["Geist"], []);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("undefined");
  });

  /*
   * Fix round 1, M4. Two empty stacks used to satisfy the equality check and
   * report "font stack shodný v první rodině: žádná" — a MATCH claimed over no
   * evidence whatsoever, which is the branch's one forbidden move, and the
   * suite pinned it. It stays a pass (there is nothing to suppress, and
   * `getComputedStyle` always yields a family so a browser cannot reach it),
   * but it must say that nothing was verified rather than that something
   * agreed.
   */
  it("does not claim a match when neither side declared a font at all", () => {
    const result = fontPreflight([], []);
    expect(result.ok).toBe(true);
    expect(result.message).not.toContain("shodn");
    expect(result.message).toMatch(/neověři|nezjist/i);
  });

  it("passes when the families match but differ only in case", () => {
    // CSS font-family names are case-insensitive; a false mismatch here stops
    // a run that should have proceeded.
    const result = fontPreflight(["geist", "JetBrains mono"], ["Geist", "jetbrains Mono"]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("geist");
  });

  it("normalises next/font/google's generated names against the design's plain family name", () => {
    // apps/web loads fonts through next/font/google, which computes
    // `__Geist_<hash>` / `__Geist_Fallback_<hash>` rather than `Geist`. The
    // metric-matched fallback is synthetic and has no design-side
    // counterpart, so it must be dropped rather than compared.
    const result = fontPreflight(
      ["Geist", "sans-serif"],
      ["__Geist_e8ce7c", "__Geist_Fallback_e8ce7c", "sans-serif"],
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Geist");
  });

  it("still fails a genuine mismatch after generated-name normalisation, proving the check isn't defanged", () => {
    const result = fontPreflight(["Geist"], ["__Inter_abc123"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });
});
