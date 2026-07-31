import fs from "node:fs/promises";
import path from "node:path";

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
      const cssPath = (el) => {
        if (el.id) return `#${el.id}`;
        const classes = [...el.classList];
        if (classes.length > 0) return `.${classes.join(".")}`;
        const parent = el.parentElement;
        const index = parent ? [...parent.children].indexOf(el) + 1 : 1;
        return `${el.tagName.toLowerCase()}:nth-child(${index})`;
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

export async function cropRegions(page, regions, outDir, limit = 5) {
  await fs.mkdir(outDir, { recursive: true });
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
