import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  SHEET_VERDICT_JSON_SCHEMA,
  VERDICT_JSON_SCHEMA,
  VerdictSchema,
  judgeError,
  qaPrompt,
  strictVerdict,
} from "./qa-prompt.ts";
import type { VisionProvider, VisionVerdict } from "./vision.ts";

export const lmstudioHost = (env: NodeJS.ProcessEnv): string =>
  env.LMSTUDIO_HOST ?? "http://127.0.0.1:1234";

type Fetch = typeof fetch;

/** The verdict object in a reply that may carry a leaked `<think>` preamble. */
export const verdictJson = (text: string): string => {
  const at = text.lastIndexOf('{"passed"');
  return at < 0 ? text : text.slice(at, text.lastIndexOf("}") + 1);
};

const lms = (env: NodeJS.ProcessEnv, args: string[], timeout: number): Promise<void> =>
  new Promise((resolve) => {
    const bin = env.PF_LMS_BIN ?? path.join(os.homedir(), ".lmstudio/bin/lms");
    execFile(bin, args, { timeout }, () => resolve());
  });

/** `lms unload --all` (memory choreography on 24 GB). Never throws. */
export const lmstudioUnloadAll = (env: NodeJS.ProcessEnv = process.env): Promise<void> =>
  lms(env, ["unload", "--all"], 15_000);

/** LM Studio's OpenAI-compatible server (`lms server start`); the model loads just-in-time. */
export function createLmstudioVisionProvider(
  env: NodeJS.ProcessEnv,
  f: Fetch = fetch,
): VisionProvider {
  const host = lmstudioHost(env);
  const model = env.PF_LMSTUDIO_MODEL || "qwen/qwen3-vl-8b";
  // Big models (gemma-4-26b) fail LM Studio's just-in-time auto-fit on 24 GB; load them
  // up front with a fixed context instead. A failed load surfaces as a judge-error below.
  const context = env.PF_LMSTUDIO_CONTEXT;
  let loaded: Promise<void> | undefined;

  async function ask(images: string[], prompt: string, sheet: boolean): Promise<string> {
    const res = await f(new URL("/v1/chat/completions", host), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_tokens: 2048,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "verdict",
            strict: true,
            schema: sheet ? SHEET_VERDICT_JSON_SCHEMA : VERDICT_JSON_SCHEMA,
          },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((b64) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`lmstudio /v1/chat/completions ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const m = body.choices?.[0]?.message;
    // Thinking models (qwen3.5) may land the whole answer in reasoning_content, content empty.
    return verdictJson(m?.content || m?.reasoning_content || "");
  }

  return {
    id: "lmstudio",
    model,
    async judge(input): Promise<VisionVerdict> {
      const t0 = performance.now();
      if (context) await (loaded ??= lms(env, ["load", model, "-c", context, "-y"], 300_000));
      const images = await Promise.all(
        [input.file, ...(input.referenceImage ? [input.referenceImage] : [])].map(async (f) =>
          (
            await sharp(f)
              .resize(768, 768, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer()
          ).toString("base64"),
        ),
      );
      const prompt = qaPrompt(input);
      let result: { passed: boolean; issues: VisionVerdict["issues"] } | undefined;
      let err = "";
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        try {
          const parsed = VerdictSchema.safeParse(
            JSON.parse(
              await ask(images, prompt, Object.keys(input.characterCounts ?? {}).length > 0),
            ),
          );
          if (parsed.success) result = strictVerdict(parsed.data, input.characterCounts);
          else err = parsed.error.message;
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
      }
      return {
        ...(result ?? judgeError(`lmstudio reply invalid: ${err.slice(0, 200)}`)),
        durationMs: Math.round(performance.now() - t0),
        costUsd: 0,
      };
    },
    dispose: () => lmstudioUnloadAll(env),
  };
}
