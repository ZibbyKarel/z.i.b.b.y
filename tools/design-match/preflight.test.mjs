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
  it("passes when both sides resolve the same families", () => {
    expect(fontPreflight(["Geist", "JetBrains Mono"], ["Geist", "JetBrains Mono"])).toEqual({
      ok: true,
      message: "font stack shodný: Geist, JetBrains Mono",
    });
  });

  it("fails and names both stacks when they differ", () => {
    const result = fontPreflight(["Geist"], ["Inter"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });

  it("passes when the families match but differ only in case", () => {
    // CSS font-family names are case-insensitive; a false mismatch here stops
    // a run that should have proceeded.
    expect(fontPreflight(["geist", "JetBrains mono"], ["Geist", "jetbrains Mono"])).toEqual({
      ok: true,
      message: "font stack shodný: geist, JetBrains mono",
    });
  });

  it("normalises next/font/google's generated names against the design's plain family name", () => {
    // apps/web loads fonts through next/font/google, which computes
    // `__Geist_<hash>` / `__Geist_Fallback_<hash>` rather than `Geist`. The
    // metric-matched fallback is synthetic and has no design-side
    // counterpart, so it must be dropped rather than compared.
    expect(
      fontPreflight(
        ["Geist", "sans-serif"],
        ["__Geist_e8ce7c", "__Geist_Fallback_e8ce7c", "sans-serif"],
      ),
    ).toEqual({
      ok: true,
      message: "font stack shodný: Geist, sans-serif",
    });
  });

  it("still fails a genuine mismatch after generated-name normalisation, proving the check isn't defanged", () => {
    const result = fontPreflight(["Geist"], ["__Inter_abc123"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });
});
