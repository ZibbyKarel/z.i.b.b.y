import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ImageItem, ImageProvider, ImageResult } from "./image.ts";
import type { VisionProvider } from "./vision.ts";

const hash = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Flat full-colour placeholder cover: coloured sky and ground, bright outlined shapes. */
function coverSvgFor(item: ImageItem): string {
  const { width: w, height: h } = item;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#3fa9f5"/>
<rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="#6cc24a"/>
<g stroke="#1f2a44" stroke-width="12"><circle cx="${w * 0.5}" cy="${h * 0.6}" r="${w * 0.22}" fill="#ffd23f"/>
<rect x="${w * 0.08}" y="${h * 0.45}" width="${w * 0.22}" height="${h * 0.2}" fill="#e94f37"/>
<polygon points="${w * 0.75},${h * 0.4} ${w * 0.95},${h * 0.66} ${w * 0.55},${h * 0.66}" fill="#f78fb3"/></g></svg>`;
}

/** Title-buddy sticker: one coloured, outlined blob on white, well inside the frame. */
const BUDDY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/>
<g stroke="#1f2a44" stroke-width="20"><ellipse cx="512" cy="560" rx="260" ry="300" fill="#7ee081"/>
<circle cx="430" cy="470" r="40" fill="white"/><circle cx="594" cy="470" r="40" fill="white"/></g></svg>`;

function svgFor(item: ImageItem): string {
  const h = hash(`${item.key}:${item.seed}`);
  const shapes = [
    `<circle cx="${380 + (h % 60)}" cy="${400}" r="${230 + (h % 40)}"/>`,
    `<rect x="${250 + (h % 50)}" y="${520}" width="520" height="${280}" rx="60"/>`,
    `<polygon points="${520},${150} ${800},${520} ${240},${520}"/>`,
  ];
  const picked = [shapes[h % 3], shapes[(h >> 3) % 3], shapes[(h >> 6) % 3]].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/>
<g fill="none" stroke="black" stroke-width="16" stroke-linejoin="round">${picked}
<text x="512" y="930" font-size="150" font-weight="bold" text-anchor="middle" stroke-width="5">${item.key.toUpperCase()}</text></g></svg>`;
}

/**
 * Deterministic placeholder line art (and a full-colour cover). PF_MOCK_FAIL_PAGES="3,5" -> gray-filled
 * image on attempt 1 for those pages; "0" -> the cover comes back as white line art on attempt 1.
 */
export function createMockImageProvider(env: NodeJS.ProcessEnv): ImageProvider {
  const failPages = new Set(
    (env.PF_MOCK_FAIL_PAGES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  );
  return {
    id: "mock",
    model: "mock-svg",
    async generateBatch(items, outDir): Promise<ImageResult[]> {
      fs.mkdirSync(outDir, { recursive: true });
      const out: ImageResult[] = [];
      for (const item of items) {
        const t0 = performance.now();
        const page = /^p(\d+)$/.exec(item.key);
        const first = (item.attempt ?? 1) === 1;
        const fail = page && failPages.has(Number(page[1])) && first;
        const cover = item.key === "cover";
        const img = item.key.startsWith("buddy-")
          ? sharp(Buffer.from(BUDDY_SVG))
          : cover
            ? sharp(Buffer.from(failPages.has(0) && first ? svgFor(item) : coverSvgFor(item)))
            : fail
              ? sharp({
                  create: {
                    width: 1024,
                    height: 1024,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 },
                  },
                })
              : sharp(Buffer.from(svgFor(item)));
        const file = path.join(outDir, `${item.key}.png`);
        await img.png().toFile(file);
        out.push({
          key: item.key,
          file,
          durationMs: Math.round(performance.now() - t0),
          costUsd: 0,
        });
      }
      return out;
    },
  };
}

export const mockVisionProvider: VisionProvider = {
  id: "mock",
  model: "mock-judge",
  async judge() {
    return { passed: true, issues: [], durationMs: 0, costUsd: 0 };
  },
};
