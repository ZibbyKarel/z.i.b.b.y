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

/** Deterministic placeholder line art. PF_MOCK_FAIL_PAGES="3,5" -> gray-filled image on attempt 1 for those pages. */
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
        const fail = page && failPages.has(Number(page[1])) && (item.attempt ?? 1) === 1;
        const img = fail
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
