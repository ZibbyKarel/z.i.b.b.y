import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createFalImageProvider } from "./fal.ts";
import { createHaikuVisionProvider } from "./haiku.ts";
import { assertLicensed } from "./licence.ts";
import { createMfluxImageProvider } from "./mflux.ts";
import { createOllamaVisionProvider, ollamaUnloadAll } from "./ollama.ts";
import type { Run } from "./proc.ts";

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
    const unload = vi.fn(async () => undefined);
    const prov = createMfluxImageProvider({ PF_MFLUX_PYTHON: "/py" }, run, unload);
    const res = await prov.generateBatch([item, { ...item, key: "p02" }], dir);
    expect(unload).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    const call = run.mock.calls[0];
    expect(call?.[0]).toBe("/py");
    expect(call?.[1][0]).toMatch(/mflux_batch\.py$/);
    const payload = JSON.parse(call?.[2]?.stdin ?? "{}");
    expect(payload).toMatchObject({ model: "flux2-klein-4b", quantize: 4, steps: 4 });
    expect(payload.items[0].prompt).toContain("thick clean black outlines");
    expect(payload.items[0].out).toBe(path.join(dir, "p01.png"));
    expect(res.map((r) => r.key)).toEqual(["p01", "p02"]);
    expect(res[0]?.costUsd).toBe(0);
  });
  it("fails when images are missing", async () => {
    const prov = createMfluxImageProvider(
      {},
      async () => ({ code: 1, stdout: "", stderr: "boom" }),
      async () => undefined,
    );
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

describe("ollama", () => {
  const input = async () => ({
    file: await png(path.join(tmp(), "a.png")),
    pageNumber: 1,
    expectedSubjects: ["cat"],
    styleGuide: "x",
  });
  const good = {
    passed: false,
    issues: [{ type: "wrong-subject", severity: "high", description: "a dog" }],
  };
  const chat = (content: string): Response => json({ message: { content } });

  it("parses a good reply and sends schema, image, keep_alive", async () => {
    const f = vi.fn<typeof fetch>(async () => chat(JSON.stringify(good)));
    const v = await createOllamaVisionProvider({}, f).judge(await input());
    expect(v.issues[0]?.type).toBe("wrong-subject");
    expect(v.costUsd).toBe(0);
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "qwen3-vl:8b-instruct",
      stream: false,
      think: false,
      keep_alive: "10m",
      options: { temperature: 0 },
    });
    expect(body.messages[0].images).toHaveLength(1);
    expect(body.format.required).toContain("passed");
  });
  it("drops low and pixel-owned issues and derives passed", async () => {
    const reply = {
      passed: false,
      issues: [
        { type: "margin-violation", severity: "high", description: "near top" },
        { type: "text-artifact", severity: "low", description: "no text, fine" },
      ],
    };
    const f = vi.fn<typeof fetch>(async () => chat(JSON.stringify(reply)));
    expect(await createOllamaVisionProvider({}, f).judge(await input())).toMatchObject({
      passed: true,
      issues: [],
    });
  });
  it("retries once on garbage, then reports judge-error", async () => {
    const f = vi.fn<typeof fetch>(async () => chat("not json"));
    const v = await createOllamaVisionProvider({}, f).judge(await input());
    expect(f).toHaveBeenCalledTimes(2);
    expect(v.passed).toBe(false);
    expect(v.issues[0]?.type).toBe("judge-error");
  });
  it("falls back to message.thinking when content is empty", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json({ message: { content: "", thinking: JSON.stringify({ passed: true, issues: [] }) } }),
    );
    expect((await createOllamaVisionProvider({}, f).judge(await input())).passed).toBe(true);
  });
  it("extracts the verdict after a leaked <think> block", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      chat('<think>\nchecking {"x":1}\n</think>\n{"passed":true,"issues":[]}'),
    );
    expect((await createOllamaVisionProvider({}, f).judge(await input())).passed).toBe(true);
  });
  it("recovers when the retry is valid", async () => {
    let n = 0;
    const f = vi.fn<typeof fetch>(async () =>
      chat(++n === 1 ? "{" : JSON.stringify({ passed: true, issues: [] })),
    );
    expect((await createOllamaVisionProvider({}, f).judge(await input())).passed).toBe(true);
  });
  it("dispose and unloadAll send keep_alive 0", async () => {
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/api/ps") ? json({ models: [{ name: "m1" }] }) : json({}),
    );
    await createOllamaVisionProvider({}, f).dispose?.();
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body))).toEqual({
      model: "qwen3-vl:8b-instruct",
      keep_alive: 0,
    });
    f.mockClear();
    await ollamaUnloadAll("http://h", f);
    expect(JSON.parse(String(f.mock.calls[1]?.[1]?.body))).toEqual({ model: "m1", keep_alive: 0 });
  });
  it("unloadAll swallows connection errors", async () => {
    await expect(
      ollamaUnloadAll("http://h", async () => Promise.reject(new Error("down"))),
    ).resolves.toBeUndefined();
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
