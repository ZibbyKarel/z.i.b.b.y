import fs from "node:fs";
import path from "node:path";
import { promptFor } from "./image.ts";
import type { ImageProvider, ImageResult } from "./image.ts";

const ENDPOINT = "https://api.openai.com/v1/images/generations";
/** Token rates in USD per 1M tokens (developers.openai.com image generation pricing, checked 2026-11). */
const USD_PER_M_IMAGE_OUTPUT = 30;
const USD_PER_M_IMAGE_INPUT = 8;
const USD_PER_M_TEXT_INPUT = 5;

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

/** Cost from the response's token usage; null when the response carries none. */
const costOf = (u: Usage | undefined): number | null => {
  if (!u || typeof u.output_tokens !== "number") return null;
  const d = u.input_tokens_details;
  const imageIn = d?.image_tokens ?? 0;
  const textIn = d?.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - imageIn);
  return (
    (u.output_tokens * USD_PER_M_IMAGE_OUTPUT +
      imageIn * USD_PER_M_IMAGE_INPUT +
      textIn * USD_PER_M_TEXT_INPUT) /
    1e6
  );
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** OpenAI Images API (text to image). Page art is portrait 8.5x11 whatever the item size says. */
export function createOpenAiImageProvider(
  env: NodeJS.ProcessEnv,
  f: typeof fetch = fetch,
  backoffMs = 1000,
): ImageProvider {
  const model = env.PF_OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
  const quality = env.PF_OPENAI_QUALITY || "medium";
  const size = env.PF_OPENAI_SIZE || "1632x2112";
  return {
    id: "openai",
    model,
    async generateBatch(items, outDir): Promise<ImageResult[]> {
      const key = env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY is not set (Settings → AI models → OpenAI)");
      for (const item of items)
        if (item.referenceImages?.length)
          throw new Error("reference images are not supported by the openai provider yet");
      fs.mkdirSync(outDir, { recursive: true });
      const out: ImageResult[] = [];
      for (const item of items) {
        const t0 = performance.now();
        const body = JSON.stringify({
          model,
          prompt: promptFor(item),
          size,
          quality,
          background: "opaque",
          output_format: "png",
          n: 1,
        });
        let res: Response | undefined;
        for (let attempt = 0; attempt <= 2; attempt++) {
          res = await f(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body,
          });
          if (res.status !== 429 && res.status < 500) break;
          if (attempt < 2) await sleep(backoffMs * 2 ** attempt);
        }
        const json = (await res?.json().catch(() => ({}))) as {
          data?: { b64_json?: string }[];
          usage?: Usage;
          error?: { code?: string; message?: string };
        };
        if (!res?.ok) {
          if (json.error?.code === "moderation_blocked")
            throw new Error(
              `openai blocked ${item.key} (moderation_blocked): ${json.error.message ?? "prompt rejected"}`,
            );
          throw new Error(
            `openai request failed for ${item.key}: HTTP ${res?.status}${json.error?.message ? ` ${json.error.message}` : ""}`,
          );
        }
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) throw new Error(`openai response for ${item.key} has no image`);
        const file = path.join(outDir, `${item.key}.png`);
        fs.writeFileSync(file, Buffer.from(b64, "base64"));
        const fallback = Number(env.PF_OPENAI_PRICE_USD);
        out.push({
          key: item.key,
          file,
          durationMs: Math.round(performance.now() - t0),
          costUsd: costOf(json.usage) ?? (Number.isFinite(fallback) ? fallback : 0),
        });
      }
      return out;
    },
  };
}
