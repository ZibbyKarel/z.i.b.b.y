import fs from "node:fs/promises";
import path from "node:path";

/**
 * Známá omezení (deliberately out of scope for this file):
 *
 * 1. The `1440×900` in `formatInventory`'s header is hardcoded rather than derived
 *    from `VIEWPORT` (browser.mjs) — wiring it would make this pure module import
 *    `@playwright/test`.
 * 2. `rankCandidates` matches plain substrings with no word boundary, so a
 *    description containing "for" hits a region whose haystack contains "form".
 */

const MIN_SIDE = 24;

/** Accent-insensitive lowercase, so "Jméno" matches "jmeno" and "jméno". */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function rankCandidates(regions, description) {
  const terms = fold(description).split(/\s+/).filter(Boolean);
  const scored = regions.map((region) => {
    const haystack = fold([region.tag, ...region.classes, region.text].join(" "));
    const hits = terms.filter((t) => haystack.includes(t)).length;
    return { region, hits, area: region.box.w * region.box.h };
  });
  return scored.sort((a, b) => b.hits - a.hits || b.area - a.area).map((s) => s.region);
}

export async function collectRegions(page) {
  return page.evaluate(
    ({ minSide }) => {
      const segmentFor = (node) => {
        if (node.id) return `#${CSS.escape(node.id)}`;
        const tag = node.tagName.toLowerCase();
        const classes = [...node.classList];
        let segment =
          classes.length > 0 ? `${tag}.${classes.map((c) => CSS.escape(c)).join(".")}` : tag;
        const parent = node.parentElement;
        if (parent) {
          const matching = [...parent.children].filter((c) => c.matches(segment));
          if (matching.length > 1) {
            const index = [...parent.children].indexOf(node) + 1;
            segment = `${segment}:nth-child(${index})`;
          }
        }
        return segment;
      };
      // Climb from the element toward <body>, joining segments with " > ", and stop
      // as soon as the accumulated chain resolves to exactly one element. The climb
      // always includes the direct child of <body>, and that segment's nth-child
      // disambiguation (against its true siblings) is unique by construction, so the
      // worst case still terminates in a selector that matches exactly one element.
      const cssPath = (el) => {
        const segments = [];
        let node = el;
        for (;;) {
          segments.unshift(segmentFor(node));
          const chain = segments.join(" > ");
          if (document.querySelectorAll(chain).length === 1) return chain;
          const parent = node.parentElement;
          if (!parent || parent.tagName.toLowerCase() === "body") return chain;
          node = parent;
        }
      };
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const tag = el.tagName.toLowerCase();
        if (tag === "html" || tag === "body" || tag === "script" || tag === "style") continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < minSide || rect.height < minSide) continue;
        out.push({
          selector: cssPath(el),
          tag,
          classes: [...el.classList],
          text: (el.textContent ?? "").trim().slice(0, 120),
          box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        });
      }
      return out;
    },
    { minSide: MIN_SIDE },
  );
}

const CROP_FILE_RE = /^r\d+\.png$/;

export async function cropRegions(page, regions, outDir, limit = 5) {
  await fs.mkdir(outDir, { recursive: true });
  const existing = await fs.readdir(outDir);
  await Promise.all(
    existing
      .filter((name) => CROP_FILE_RE.test(name))
      .map((name) => fs.unlink(path.join(outDir, name))),
  );
  const written = [];
  for (const [index, region] of regions.slice(0, limit).entries()) {
    const file = path.join(outDir, `r${index + 1}.png`);
    await page.screenshot({
      path: file,
      clip: { x: region.box.x, y: region.box.y, width: region.box.w, height: region.box.h },
    });
    written.push(file);
  }
  return written;
}

export function formatInventory(regions, limit = 5) {
  const lines = ["Inventura regionů (1440×900):"];
  regions.slice(0, limit).forEach((region, index) => {
    const size = `${Math.round(region.box.w)}×${Math.round(region.box.h)}`;
    const at = `(${Math.round(region.box.x)},${Math.round(region.box.y)})`;
    lines.push(
      `  [${index + 1}] ${region.selector.padEnd(24)} ${size.padStart(9)} @ ${at}   ▸ r${index + 1}.png`,
    );
  });
  return lines.join("\n");
}
