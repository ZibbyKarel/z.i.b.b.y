import sharp from "sharp";
import { VERDICT_JSON_SCHEMA, VerdictSchema, judgeError, qaPrompt } from "./qa-prompt.ts";
import type { VisionProvider, VisionVerdict } from "./vision.ts";

export const ollamaHost = (env: NodeJS.ProcessEnv): string => {
  const h = env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  return h.startsWith("http") ? h : `http://${h}`;
};

type Fetch = typeof fetch;

const post = (f: Fetch, host: string, p: string, body: unknown): Promise<Response> =>
  f(new URL(p, host), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** Ask Ollama to drop every loaded model (memory choreography on 24 GB). Never throws. */
export async function ollamaUnloadAll(host: string, f: Fetch = fetch): Promise<void> {
  try {
    const res = await f(new URL("/api/ps", host), { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { models?: { name: string }[] };
    for (const m of body.models ?? [])
      await post(f, host, "/api/generate", { model: m.name, keep_alive: 0 });
  } catch {
    // ollama not running: nothing to unload
  }
}

export function createOllamaVisionProvider(
  env: NodeJS.ProcessEnv,
  f: Fetch = fetch,
): VisionProvider {
  const host = ollamaHost(env);
  const model = env.PF_OLLAMA_MODEL || "qwen3-vl:8b";

  async function ask(b64: string, prompt: string): Promise<string> {
    const res = await post(f, host, "/api/chat", {
      model,
      stream: false,
      format: VERDICT_JSON_SCHEMA,
      // qwen3-vl thinks by default: the reasoning ate the budget and `content` came back
      // empty (live run, 2026-10-01). A verdict needs no chain of thought.
      think: false,
      keep_alive: "10m",
      options: { temperature: 0, num_predict: 768 },
      messages: [{ role: "user", content: prompt, images: [b64] }],
    });
    if (!res.ok) throw new Error(`ollama /api/chat ${res.status}`);
    const body = (await res.json()) as { message?: { content?: string; thinking?: string } };
    return body.message?.content || body.message?.thinking || "";
  }

  return {
    id: "ollama",
    model,
    async judge(input): Promise<VisionVerdict> {
      const t0 = performance.now();
      const b64 = (
        await sharp(input.file)
          .resize(768, 768, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer()
      ).toString("base64");
      const prompt = qaPrompt(input);
      let result: { passed: boolean; issues: VisionVerdict["issues"] } | undefined;
      let err = "";
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        try {
          const parsed = VerdictSchema.safeParse(JSON.parse(await ask(b64, prompt)));
          if (parsed.success) result = parsed.data;
          else err = parsed.error.message;
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
      }
      return {
        ...(result ?? judgeError(`ollama reply invalid: ${err.slice(0, 200)}`)),
        durationMs: Math.round(performance.now() - t0),
        costUsd: 0,
      };
    },
    async dispose() {
      await post(f, host, "/api/generate", { model, keep_alive: 0 }).catch(() => undefined);
    },
  };
}
