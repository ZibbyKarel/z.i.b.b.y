import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_H, PAGE_W, SAFE_BOX, processImage } from "../image-proc.ts";
import { createMockImageProvider } from "../providers/mock.ts";
import { tmpCtx } from "../testkit.ts";
import { grayRatioOf, pixelQa } from "./pixel.ts";

const N = PAGE_W * PAGE_H;
const types = (r: ReturnType<typeof pixelQa>): string[] => r.issues.map((i) => i.type);

describe("pixelQa", () => {
  it("all white -> too-sparse", () => {
    expect(types(pixelQa(new Uint8Array(N).fill(255), PAGE_W, 0, SAFE_BOX))).toEqual([
      "too-sparse",
    ]);
  });
  it("gray-filled raw image -> gray-area", () => {
    const gray = new Uint8Array(1000).fill(128);
    expect(
      types(pixelQa(new Uint8Array(N).fill(255), PAGE_W, grayRatioOf(gray), SAFE_BOX)),
    ).toContain("gray-area");
  });
  it("ink in the margin -> margin-violation", () => {
    const px = new Uint8Array(N).fill(255);
    for (let y = 400; y < 1200; y++) for (let x = 400; x < 1200; x++) px[y * PAGE_W + x] = 0; // legit ink
    for (let y = 0; y < 100; y++) for (let x = 0; x < PAGE_W; x++) px[y * PAGE_W + x] = 0; // top margin
    expect(types(pixelQa(px, PAGE_W, 0, SAFE_BOX))).toEqual(["margin-violation"]);
  });
  it("very dense -> too-complex", () => {
    expect(types(pixelQa(new Uint8Array(N).fill(0), PAGE_W, 0, null))).toEqual(["too-complex"]);
  });
  it("a normal mock image passes", async () => {
    const ctx = tmpCtx();
    const [res] = await createMockImageProvider({}).generateBatch(
      [{ key: "p01", prompt: "x", seed: 7, width: 1024, height: 1024 }],
      ctx.cwd,
    );
    const proc = await processImage(res!.file, path.join(ctx.cwd, "out.png"), 160, true);
    const r = pixelQa(proc.pixels, PAGE_W, proc.rawGrayRatio, proc.box);
    expect(r.issues).toEqual([]);
    expect(r.inkRatio).toBeGreaterThan(0.01);
  });
});
