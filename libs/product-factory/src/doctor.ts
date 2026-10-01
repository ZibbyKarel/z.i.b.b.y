import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ALLOWED_IMAGE_MODELS, imageModelOf } from "./providers/licence.ts";
import { mfluxPython } from "./providers/mflux.ts";
import { ollamaHost } from "./providers/ollama.ts";
import type { Ctx } from "./ctx.ts";

const onPath = (bin: string): string | null => {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** HF cache dir names look like models--black-forest-labs--FLUX.2-klein-4B. */
const weightsCached = (model: string): boolean => {
  const hub = path.join(os.homedir(), ".cache/huggingface/hub");
  const re = model.startsWith("flux2-klein") ? /klein.*4b/i : /z-image-turbo/i;
  return fs.existsSync(hub) && fs.readdirSync(hub).some((d) => re.test(d));
};

/** Environment check; always exits 0, prints human-readable lines. */
export async function doctor(_argv: string[], ctx: Ctx): Promise<number> {
  const env = ctx.env;
  const out = (ok: boolean | "warn", msg: string): void =>
    console.log(`${ok === true ? "[ok]  " : ok === "warn" ? "[warn]" : "[miss]"} ${msg}`);
  const model = imageModelOf(env);
  const licensed = ALLOWED_IMAGE_MODELS.includes(model);
  console.log(
    `image provider: ${env.PF_IMAGE_PROVIDER ?? "mock"}   vision provider: ${env.PF_VISION_PROVIDER ?? "none"}   image model: ${model}`,
  );
  out(
    licensed,
    licensed
      ? `${model} is licensed for commercial use`
      : `${model} is NOT licensed for commercial use`,
  );

  const py = mfluxPython(env);
  const imp = fs.existsSync(py)
    ? spawnSync(py, ["-c", "import mflux"], { encoding: "utf8" })
    : null;
  out(
    imp?.status === 0,
    imp?.status === 0
      ? `mflux importable via ${py}`
      : `mflux not importable via ${py} (uv tool install mflux)`,
  );
  const cached = weightsCached(model);
  out(
    cached ? true : "warn",
    cached
      ? `${model} weights cached`
      : `${model} weights not cached (first run downloads several GB)`,
  );

  const host = ollamaHost(env);
  const vmodel = env.PF_OLLAMA_MODEL || "qwen3-vl:8b";
  try {
    const res = await fetch(new URL("/api/tags", host), { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { models?: { name: string }[] };
    const has = (body.models ?? []).some(
      (m) => m.name === vmodel || m.name.startsWith(`${vmodel}:`),
    );
    out(true, `ollama reachable at ${host}`);
    out(
      has,
      has
        ? `ollama model ${vmodel} present`
        : `ollama model ${vmodel} not pulled (ollama pull ${vmodel})`,
    );
  } catch {
    out(false, `ollama not reachable at ${host}`);
  }

  out(!!env.FAL_KEY, env.FAL_KEY ? "FAL_KEY is set" : "FAL_KEY not set");
  const claude = onPath("claude");
  out(!!claude, claude ? `claude: ${claude}` : "claude not on PATH");
  const freeGb = os.freemem() / 1024 ** 3;
  out(
    freeGb >= 8 ? true : "warn",
    `free memory ${freeGb.toFixed(1)} GB${freeGb >= 8 ? "" : " (< 8 GB: local image model may swap)"}`,
  );
  return 0;
}
