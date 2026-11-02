import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createFalImageProvider } from "./fal.ts";
import { createHaikuVisionProvider } from "./haiku.ts";
import { assertLicensed } from "./licence.ts";
import { createMfluxImageProvider } from "./mflux.ts";
import { createOpenAiImageProvider } from "./openai.ts";
import type { Run } from "./proc.ts";
import { qaPrompt, strictVerdict } from "./qa-prompt.ts";

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "pf-prov-"));
const item = { key: "p01", prompt: "a cat", seed: 7, width: 1024, height: 1024 };
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

async function png(file: string): Promise<string> {
  await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } })
    .png()
    .toFile(file);
  return file;
}

describe("licence", () => {
  it("allows klein 4b and z-image-turbo", () => {
    expect(() => assertLicensed("flux2-klein-4b")).not.toThrow();
    expect(() => assertLicensed("z-image-turbo")).not.toThrow();
  });
  it("refuses 9b and dev", () => {
    expect(() => assertLicensed("flux2-klein-9b")).toThrow(/not licensed for commercial use/);
    expect(() => assertLicensed("dev")).toThrow(/model dev is not licensed/);
  });
  it("mflux provider refuses before generating", () => {
    expect(() => createMfluxImageProvider({ PF_IMAGE_MODEL: "dev" })).toThrow(/not licensed/);
    expect(() => createMfluxImageProvider({ PF_IMAGE_LORA: "some/nc-lora" })).toThrow(/LoRA/);
  });
});

describe("mflux", () => {
  it("sends one batch payload to the driver and maps the result lines", async () => {
    const dir = tmp();
    const run = vi.fn<Run>(async (_c, _a, o) => {
      const p = JSON.parse(o?.stdin ?? "{}") as { items: { key: string; out: string }[] };
      return {
        code: 0,
        stdout: [
          "loading...",
          ...p.items.map((i) => JSON.stringify({ key: i.key, file: i.out, durationMs: 5 })),
        ].join("\n"),
        stderr: "",
      };
    });
    const prov = createMfluxImageProvider({ PF_MFLUX_PYTHON: "/py" }, run);
    const res = await prov.generateBatch(
      [item, { ...item, key: "p02", referenceImages: ["/cast.png"] }],
      dir,
    );
    expect(run).toHaveBeenCalledOnce();
    const call = run.mock.calls[0];
    expect(call?.[0]).toBe("/py");
    expect(call?.[1][0]).toMatch(/mflux_batch\.py$/);
    const payload = JSON.parse(call?.[2]?.stdin ?? "{}");
    expect(payload).toMatchObject({ model: "flux2-klein-4b", quantize: 4, steps: 4 });
    expect(payload.items[0].prompt).toContain("thick clean black outlines");
    expect(payload.items[0].out).toBe(path.join(dir, "p01.png"));
    expect(payload.items[0].images).toBeUndefined();
    expect(payload.items[1].images).toEqual(["/cast.png"]);
    expect(res.map((r) => r.key)).toEqual(["p01", "p02"]);
    expect(res[0]?.costUsd).toBe(0);
  });
  it("fails when images are missing", async () => {
    const prov = createMfluxImageProvider({}, async () => ({
      code: 1,
      stdout: "",
      stderr: "boom",
    }));
    await expect(prov.generateBatch([item], tmp())).rejects.toThrow(/mflux batch failed/);
  });
});

describe("fal", () => {
  const imgRes = (): Response => new Response(new Uint8Array([1, 2, 3]));
  it("writes the file and prices per megapixel", async () => {
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("fal.run") ? json({ images: [{ url: "https://cdn/x.png" }] }) : imgRes(),
    );
    const dir = tmp();
    const res = await createFalImageProvider({ FAL_KEY: "k" }, f, 0).generateBatch([item], dir);
    expect(fs.readFileSync(res[0]?.file ?? "")).toEqual(Buffer.from([1, 2, 3]));
    expect(res[0]?.costUsd).toBeCloseTo(0.005 * 1.048576, 6);
    const headers = f.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key k");
  });
  it("sends reference images to the edit endpoint as data URIs", async () => {
    const ref = await png(path.join(tmp(), "cast.png"));
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("fal.run") ? json({ images: [{ url: "https://cdn/x.png" }] }) : imgRes(),
    );
    await createFalImageProvider({ FAL_KEY: "k" }, f, 0).generateBatch(
      [{ ...item, referenceImages: [ref] }],
      tmp(),
    );
    expect(String(f.mock.calls[0]?.[0])).toMatch(/klein\/4b\/edit$/);
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body)) as { image_urls: string[] };
    expect(body.image_urls[0]).toMatch(/^data:image\/png;base64,/);
  });
  it("retries 429 then succeeds; PF_FAL_PRICE_USD overrides", async () => {
    let n = 0;
    const f = vi.fn<typeof fetch>(async (url) => {
      if (!String(url).includes("fal.run")) return imgRes();
      return ++n === 1 ? json({}, 429) : json({ images: [{ url: "https://cdn/x.png" }] });
    });
    const res = await createFalImageProvider(
      { FAL_KEY: "k", PF_FAL_PRICE_USD: "0.01" },
      f,
      0,
    ).generateBatch([item], tmp());
    expect(n).toBe(2);
    expect(res[0]?.costUsd).toBe(0.01);
  });
  it("gives up after 2 retries", async () => {
    const f = vi.fn<typeof fetch>(async () => json({}, 503));
    await expect(
      createFalImageProvider({ FAL_KEY: "k" }, f, 0).generateBatch([item], tmp()),
    ).rejects.toThrow(/503/);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("missing key is a clear error", async () => {
    await expect(createFalImageProvider({}).generateBatch([item], tmp())).rejects.toThrow(
      /FAL_KEY is not set/,
    );
  });
});

describe("openai", () => {
  const b64 = Buffer.from([9, 8, 7]).toString("base64");
  const ok = (usage?: unknown): Response => json({ data: [{ b64_json: b64 }], usage });
  const env = { OPENAI_API_KEY: "sk-x" };
  it("sends the request, writes the decoded png, prices from usage", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      ok({ input_tokens: 100, output_tokens: 1000, input_tokens_details: { text_tokens: 100 } }),
    );
    const dir = tmp();
    const res = await createOpenAiImageProvider(env, f, 0).generateBatch([item], dir);
    expect(fs.readFileSync(path.join(dir, "p01.png"))).toEqual(Buffer.from([9, 8, 7]));
    expect(res[0]?.costUsd).toBeCloseTo((1000 * 30 + 100 * 5) / 1e6, 8);
    expect(String(f.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/images/generations");
    const headers = f.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-x");
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gpt-image-2.5-flare",
      size: "1632x2112",
      quality: "medium",
      background: "opaque",
      output_format: "png",
      n: 1,
    });
    expect(body.prompt).toContain("thick clean black outlines");
  });
  it("env knobs override; no usage falls back to PF_OPENAI_PRICE_USD", async () => {
    const f = vi.fn<typeof fetch>(async () => ok());
    const res = await createOpenAiImageProvider(
      {
        ...env,
        PF_OPENAI_IMAGE_MODEL: "gpt-image-2.5-sunburst",
        PF_OPENAI_QUALITY: "high",
        PF_OPENAI_SIZE: "1024x1536",
        PF_OPENAI_PRICE_USD: "0.04",
      },
      f,
      0,
    ).generateBatch([item], tmp());
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "gpt-image-2.5-sunburst",
      quality: "high",
      size: "1024x1536",
    });
    expect(res[0]?.costUsd).toBe(0.04);
  });
  it("retries 429 then succeeds", async () => {
    let n = 0;
    const f = vi.fn<typeof fetch>(async () => (++n === 1 ? json({}, 429) : ok()));
    await createOpenAiImageProvider(env, f, 0).generateBatch([item], tmp());
    expect(n).toBe(2);
  });
  it("missing key is a clear error", async () => {
    await expect(createOpenAiImageProvider({}).generateBatch([item], tmp())).rejects.toThrow(
      /OPENAI_API_KEY is not set/,
    );
  });
  it("sends reference images to the edits endpoint as multipart image[]", async () => {
    const ref = await png(path.join(tmp(), "cast.png"));
    const f = vi.fn<typeof fetch>(async () => ok());
    await createOpenAiImageProvider(env, f, 0).generateBatch(
      [{ ...item, referenceImages: [ref, ref] }],
      tmp(),
    );
    expect(String(f.mock.calls[0]?.[0])).toMatch(/images\/edits$/);
    const init = f.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-x");
    const fd = init?.body as FormData;
    expect(fd.getAll("image[]")).toHaveLength(2);
    expect(fd.get("model")).toBe("gpt-image-2.5-flare");
    expect(String(fd.get("prompt"))).toContain("thick clean black outlines");
  });
  it("moderation_blocked names the item", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json({ error: { code: "moderation_blocked", message: "nope" } }, 400),
    );
    await expect(createOpenAiImageProvider(env, f, 0).generateBatch([item], tmp())).rejects.toThrow(
      /p01.*moderation_blocked/,
    );
  });
});

describe("haiku", () => {
  it("parses envelope + fenced json, cost = total_cost_usd", async () => {
    const result =
      "Here you go\n```json\n" + JSON.stringify({ passed: true, issues: [] }) + "\n```";
    const run = vi.fn<Run>(async () => ({
      code: 0,
      stdout: JSON.stringify({ result, total_cost_usd: 0.0042 }),
      stderr: "",
    }));
    const v = await createHaikuVisionProvider({}, run).judge({
      file: "/x/a.png",
      pageNumber: 1,
      expectedSubjects: [],
      styleGuide: "",
    });
    expect(v).toMatchObject({ passed: true, costUsd: 0.0042 });
    const args = run.mock.calls[0]?.[1] ?? [];
    expect(args).toContain("haiku");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(run.mock.calls[0]?.[2]?.stdin).toContain("/x/a.png");
  });
  it("garbage -> judge-error, still carries cost", async () => {
    const run: Run = async () => ({
      code: 0,
      stdout: JSON.stringify({ result: "nope", total_cost_usd: 0.001 }),
      stderr: "",
    });
    const v = await createHaikuVisionProvider({}, run).judge({
      file: "/x/a.png",
      pageNumber: 1,
      expectedSubjects: [],
      styleGuide: "",
    });
    expect(v.issues[0]?.type).toBe("judge-error");
    expect(v.costUsd).toBe(0.001);
  });
});

describe("sheet verdict counts", () => {
  it("turns a blind miscount into an off-model issue even when the judge passed it", () => {
    const v = strictVerdict(
      {
        counts: [
          { feature: "Buttons ", seen: 2 },
          { feature: "eyes", seen: 2 },
        ],
        passed: true,
        issues: [],
      },
      { buttons: 3, eyes: 2, antennae: 2 },
    );
    expect(v.passed).toBe(false);
    expect(v.issues).toEqual([
      { type: "off-model", severity: "high", description: "buttons: spec says 3, drawn 2" },
    ]);
  });

  it("never shows the judge the expected numbers", () => {
    const p = qaPrompt({
      file: "f",
      pageNumber: 0,
      expectedSubjects: [],
      styleGuide: "",
      characterSpec: "a suit with exactly 3 buttons and two antennae",
      characterCounts: { buttons: 3 },
    });
    expect(p).toContain("a suit with buttons and antennae");
    expect(p).not.toMatch(/\b3\b|two antennae/);
    expect(p).toContain("- buttons");
  });
});
