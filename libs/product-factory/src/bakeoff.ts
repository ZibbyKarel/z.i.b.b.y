import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { envNum } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { processImage } from "./image-proc.ts";
import { createImageProvider, createVisionProvider } from "./providers/index.ts";
import { pixelQa } from "./qa/pixel.ts";
import { thresholdsOf } from "./produce.ts";
import { FIXTURES_DEFAULT_PROMPTS } from "./bakeoff-defaults.ts";

const PromptsSchema = z.array(z.strictObject({ key: z.string(), prompt: z.string() }));

interface Row {
  config: string;
  key: string;
  file: string;
  seconds: number;
  grayRatio: number;
  inkRatio: number;
  pixelPass: boolean;
  visionPass: string;
}

/** Same prompts + fixed seeds per config -> table in bakeoff.md. Vision QA runs after ALL images so models never overlap. */
export async function bakeoff(argv: string[], ctx: Ctx): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      prompts: { type: "string", default: FIXTURES_DEFAULT_PROMPTS },
      out: { type: "string", default: "bakeoff" },
      configs: { type: "string", default: "flux2-klein-4b:4:4,z-image-turbo:4:8" },
    },
  });
  const prompts = PromptsSchema.parse(
    JSON.parse(fs.readFileSync(path.resolve(ctx.cwd, values.prompts), "utf8")),
  );
  const outDir = path.resolve(ctx.cwd, values.out);
  const th = thresholdsOf(ctx);
  const threshold = envNum(ctx, "PF_THRESHOLD", 160);
  const size = envNum(ctx, "PF_IMAGE_SIZE", 1024);

  // Build every provider first: an unlicensed model throws before anything is generated.
  const configs = values.configs.split(",").map((c) => {
    const [model = "", q = "4", steps = "4"] = c.split(":");
    const env = {
      ...ctx.env,
      PF_IMAGE_PROVIDER: ctx.env.PF_IMAGE_PROVIDER ?? "mflux",
      PF_IMAGE_MODEL: model,
      PF_MFLUX_QUANTIZE: q,
      PF_MFLUX_STEPS: steps,
    };
    return { id: `${model}-q${q}-s${steps}`, provider: createImageProvider(env) };
  });
  const vision = createVisionProvider(ctx.env);

  const rows: Row[] = [];
  for (const cfg of configs) {
    const dir = path.join(outDir, cfg.id);
    fs.mkdirSync(dir, { recursive: true });
    const results = await cfg.provider.generateBatch(
      prompts.map((p, i) => ({
        key: p.key,
        prompt: p.prompt,
        seed: 1000 + i,
        width: size,
        height: size,
      })),
      path.join(dir, "raw"),
    );
    await cfg.provider.dispose?.();
    for (const r of results) {
      const file = path.join(dir, `${r.key}.png`);
      const proc = await processImage(r.file, file, threshold, true);
      const px = pixelQa(proc.pixels, 2550, proc.rawGrayRatio, proc.box, th, false);
      rows.push({
        config: cfg.id,
        key: r.key,
        file,
        seconds: r.durationMs / 1000,
        grayRatio: px.grayRatio,
        inkRatio: px.inkRatio,
        pixelPass: px.issues.length === 0,
        visionPass: "-",
      });
    }
  }

  if (vision) {
    for (const row of rows) {
      const p = prompts.find((x) => x.key === row.key);
      const v = await vision.judge({
        file: row.file,
        pageNumber: 0,
        expectedSubjects: p ? [p.prompt] : [],
        styleGuide:
          "Simple cute line art for toddlers, thick uniform black outlines, white background.",
      });
      row.visionPass = v.passed ? "yes" : `no (${v.issues.map((i) => i.type).join(",")})`;
    }
    await vision.dispose?.();
  }

  const md = [
    "# Bake-off",
    "",
    "| config | image | seconds | grayRatio | inkRatio | pixel pass | vision pass |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.config} | ${r.key} | ${r.seconds.toFixed(1)} | ${r.grayRatio.toFixed(4)} | ${r.inkRatio.toFixed(4)} | ${r.pixelPass ? "yes" : "no"} | ${r.visionPass} |`,
    ),
    "",
    "## Images",
    "",
    ...rows.map((r) => `- ${r.file}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "bakeoff.md"), md);
  console.log(`bakeoff: ${rows.length} images, report ${path.join(outDir, "bakeoff.md")}`);
  return 0;
}
