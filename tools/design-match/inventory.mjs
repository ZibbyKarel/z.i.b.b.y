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
      // as soon as the accumulated chain resolves to exactly one element. Per-level
      // nth-child only disambiguates a node from its own true siblings — it does NOT
      // anchor the chain to a fixed root, so an unanchored chain can still match a
      // structurally identical (but unrelated) fragment elsewhere in the document,
      // e.g. the same component markup nested again inside a different, non-sibling
      // subtree. If the climb reaches a direct child of <body> without the chain
      // having resolved to a unique match, anchor it by prefixing `body > `: every
      // level below already carries `:nth-child(k)` wherever it was ambiguous among
      // its own siblings, so the anchored chain is a single, fully determined path
      // from one fixed root and is therefore guaranteed unique.
      const cssPath = (el) => {
        const segments = [];
        let node = el;
        for (;;) {
          segments.unshift(segmentFor(node));
          const chain = segments.join(" > ");
          if (document.querySelectorAll(chain).length === 1) return chain;
          const parent = node.parentElement;
          if (parent && parent.tagName.toLowerCase() === "body") return `body > ${chain}`;
          if (!parent) return chain;
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
          // Document coordinates, not viewport coordinates. `cropRegions`
          // screenshots with `fullPage: true`, whose `clip` is resolved
          // against the full document — so the two must be the same space or
          // every crop below the fold would be off by the scroll offset. The
          // page is never scrolled at collection time, so these terms are
          // currently zero; they are written down anyway so the coordinate
          // space is a stated property of this box rather than an accident of
          // when it happens to be measured.
          box: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            w: rect.width,
            h: rect.height,
          },
        });
      }
      return out;
    },
    { minSide: MIN_SIDE },
  );
}

const CROP_FILE_RE = /^r\d+\.png$/;

/**
 * Subpixel slack only. A box may exceed the page image by a fraction of a pixel
 * through rounding; it must not be allowed to exceed it by an amount that would
 * make the crop a different rectangle from the one the region names.
 */
const PAGE_BOUNDS_TOLERANCE = 1;

/**
 * Whether a region can be cropped out of the full-page screenshot at all.
 *
 * `page.screenshot({ fullPage: true })` produces an image the size of the
 * scrollable document, and a `clip` outside it is a hard Playwright error. Most
 * regions are inside it — but not all: `ZIBBY Redesign Canvas.html` is a pan/zoom
 * canvas whose cards live inside a transformed, `overflow: hidden` container, so
 * `getBoundingClientRect` reports boxes at y≈1200 and 4256px wide while the
 * document itself never grows past 1440×900. Those elements are real and their
 * computed styles are real — they are simply not on the picture.
 *
 * A region like that gets NO preview rather than a wrong one or a crash. Both
 * alternatives were rejected: cropping the intersection would hand the operator
 * a picture that silently isn't the region they are choosing between, and
 * throwing kills a whole `measure` over one thumbnail.
 */
export function cropFitsPage(box, pageSize) {
  return (
    box.x >= -PAGE_BOUNDS_TOLERANCE &&
    box.y >= -PAGE_BOUNDS_TOLERANCE &&
    box.x + box.w <= pageSize.width + PAGE_BOUNDS_TOLERANCE &&
    box.y + box.h <= pageSize.height + PAGE_BOUNDS_TOLERANCE
  );
}

/**
 * One entry per region, in order, so the caller can pair `written[i]` with
 * `regions[i]`: the file path when a crop was taken, `null` when the region does
 * not lie on the page image (see `cropFitsPage`). `formatInventory` renders the
 * `null`s as "no preview, and here is why" — the tool must not print an `rN.png`
 * it did not write.
 */
export async function cropRegions(page, regions, outDir, limit = 5) {
  await fs.mkdir(outDir, { recursive: true });
  const existing = await fs.readdir(outDir);
  await Promise.all(
    existing
      .filter((name) => CROP_FILE_RE.test(name))
      .map((name) => fs.unlink(path.join(outDir, name))),
  );
  const pageSize = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
  }));
  const written = [];
  for (const [index, region] of regions.slice(0, limit).entries()) {
    if (!cropFitsPage(region.box, pageSize)) {
      written.push(null);
      continue;
    }
    const file = path.join(outDir, `r${index + 1}.png`);
    await page.screenshot({
      path: file,
      // Without `fullPage`, `clip` is resolved against the 900px-tall viewport,
      // so any candidate whose box starts below the fold threw a raw
      // Playwright "Clipped area is either empty or outside the resulting
      // image" — which killed every long-document mockup. With it, `clip` is
      // resolved against the full document, the same space `collectRegions`
      // reports boxes in.
      fullPage: true,
      clip: {
        // Clamped only within the subpixel tolerance above, so a box that is
        // genuinely on the page keeps its exact rectangle and one that is not
        // never got here.
        x: Math.max(0, region.box.x),
        y: Math.max(0, region.box.y),
        width: Math.min(region.box.w, pageSize.width - Math.max(0, region.box.x)),
        height: Math.min(region.box.h, pageSize.height - Math.max(0, region.box.y)),
      },
    });
    written.push(file);
  }
  return written;
}

/**
 * `crops` is `cropRegions`' return value: one entry per region, `null` where no
 * preview could be taken. When it is omitted every region is listed with its
 * `rN.png`, which is what every caller before crops could be skipped relied on.
 * When it IS supplied, a region with no crop says so — printing `▸ r3.png` for a
 * file that was never written is the tool claiming something it cannot back.
 */
export function formatInventory(regions, limit = 5, crops) {
  const lines = ["Inventura regionů (1440×900):"];
  regions.slice(0, limit).forEach((region, index) => {
    const size = `${Math.round(region.box.w)}×${Math.round(region.box.h)}`;
    const at = `(${Math.round(region.box.x)},${Math.round(region.box.y)})`;
    const preview =
      crops !== undefined && crops[index] === null
        ? "bez náhledu — region leží mimo snímek stránky"
        : `r${index + 1}.png`;
    lines.push(
      `  [${index + 1}] ${region.selector.padEnd(24)} ${size.padStart(9)} @ ${at}   ▸ ${preview}`,
    );
  });
  return lines.join("\n");
}
