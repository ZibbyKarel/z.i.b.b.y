import fs from "node:fs";
import path from "node:path";
import { promptFor } from "./image.ts";
import type { ImageProvider, ImageResult } from "./image.ts";

const ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
/** $0.005 per megapixel (https://fal.ai/models/fal-ai/flux-2/klein/4b, checked 2026-10). */
const USD_PER_MEGAPIXEL = 0.005;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createFalImageProvider(
  env: NodeJS.ProcessEnv,
  f: typeof fetch = fetch,
  backoffMs = 1000,
): ImageProvider {
  return {
    id: "fal",
    model: "fal-ai/flux-2/klein/4b",
    async generateBatch(items, outDir): Promise<ImageResult[]> {
      const key = env.FAL_KEY;
      if (!key) throw new Error("FAL_KEY is not set (put it in the project secrets)");
      fs.mkdirSync(outDir, { recursive: true });
      const out: ImageResult[] = [];
      for (const item of items) {
        const t0 = performance.now();
        const refs = item.referenceImages ?? [];
        const body = JSON.stringify({
          prompt: promptFor(item),
          // ponytail: inline data URIs (no upload step); switch to fal storage uploads if requests get too large
          ...(refs.length > 0 && {
            image_urls: refs.map(
              (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`,
            ),
          }),
          seed: item.seed,
          image_size: { width: item.width, height: item.height },
          num_images: 1,
          output_format: "png",
          num_inference_steps: 4,
        });
        let res: Response | undefined;
        for (let attempt = 0; attempt <= 2; attempt++) {
          res = await f(refs.length > 0 ? `${ENDPOINT}/edit` : ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Key ${key}`, "content-type": "application/json" },
            body,
          });
          if (res.status !== 429 && res.status < 500) break;
          if (attempt < 2) await sleep(backoffMs * 2 ** attempt);
        }
        if (!res?.ok) throw new Error(`fal.ai request failed: HTTP ${res?.status}`);
        const url = ((await res.json()) as { images?: { url: string }[] }).images?.[0]?.url;
        if (!url) throw new Error("fal.ai response has no image url");
        const img = await f(url);
        if (!img.ok) throw new Error(`fal.ai image download failed: HTTP ${img.status}`);
        const file = path.join(outDir, `${item.key}.png`);
        fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
        const price =
          env.PF_FAL_PRICE_USD !== undefined && env.PF_FAL_PRICE_USD !== ""
            ? Number(env.PF_FAL_PRICE_USD)
            : (USD_PER_MEGAPIXEL * item.width * item.height) / 1e6;
        out.push({
          key: item.key,
          file,
          durationMs: Math.round(performance.now() - t0),
          costUsd: price,
        });
      }
      return out;
    },
  };
}
