import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { assertLicensed, imageModelOf, lorasOf } from "./licence.ts";
import { ollamaHost, ollamaUnloadAll } from "./ollama.ts";
import { run as defaultRun } from "./proc.ts";
import type { Run } from "./proc.ts";
import { COLORING_SUFFIX } from "./image.ts";
import type { ImageProvider, ImageResult } from "./image.ts";

export const mfluxPython = (env: NodeJS.ProcessEnv): string =>
  env.PF_MFLUX_PYTHON || path.join(os.homedir(), ".local/share/uv/tools/mflux/bin/python");

export const DRIVER = path.resolve(import.meta.dirname, "../../py/mflux_batch.py");

/** Local mflux; the Python driver keeps the model loaded for the whole batch. FLUX.2 and Z-Image Turbo take no negative prompt, so none is sent. */
export function createMfluxImageProvider(
  env: NodeJS.ProcessEnv,
  run: Run = defaultRun,
  unload: () => Promise<void> = () => ollamaUnloadAll(ollamaHost(env)),
): ImageProvider {
  const model = imageModelOf(env);
  assertLicensed(model);
  const loras = lorasOf(env);
  const quantize = Number(env.PF_MFLUX_QUANTIZE) || 4;
  // ponytail: klein is distilled (4 steps); z-image-turbo is ~8 -- set PF_MFLUX_STEPS per model when benchmarking
  const steps = Number(env.PF_MFLUX_STEPS) || (model === "z-image-turbo" ? 8 : 4);
  return {
    id: "mflux",
    model,
    async generateBatch(items, outDir): Promise<ImageResult[]> {
      fs.mkdirSync(outDir, { recursive: true });
      await unload();
      const payload = {
        model,
        quantize,
        steps,
        loras,
        items: items.map((i) => ({
          key: i.key,
          prompt: `${i.prompt}. ${COLORING_SUFFIX}`,
          seed: i.seed,
          width: i.width,
          height: i.height,
          out: path.join(outDir, `${i.key}.png`),
        })),
      };
      const r = await run(mfluxPython(env), [DRIVER], {
        stdin: JSON.stringify(payload),
        forwardStderr: true,
      });
      const done = new Map<string, ImageResult>();
      for (const line of r.stdout.split("\n")) {
        try {
          const o = JSON.parse(line) as { key?: string; file?: string; durationMs?: number };
          if (o.key && o.file)
            done.set(o.key, {
              key: o.key,
              file: o.file,
              durationMs: o.durationMs ?? 0,
              costUsd: 0,
            });
        } catch {
          // mflux progress noise
        }
      }
      if (r.code !== 0 || done.size !== items.length)
        throw new Error(
          `mflux batch failed (exit ${r.code}, ${done.size}/${items.length} images): ${r.stderr.slice(-400)}`,
        );
      return items.map((i) => done.get(i.key) as ImageResult);
    },
  };
}
