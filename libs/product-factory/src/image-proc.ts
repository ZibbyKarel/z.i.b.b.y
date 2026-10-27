import sharp from "sharp";
import { grayRatioOf } from "./qa/pixel.ts";
import type { Box } from "./qa/pixel.ts";

/** 8.5x11 in at 300 DPI. */
export const PAGE_W = 2550;
export const PAGE_H = 3300;
/** KDP safe area: 0.5 in margins on all sides. */
export const SAFE_BOX: Box = { x: 150, y: 150, w: 2250, h: 3000 };

// 1-pixel morphological pass over a 0/1 mask: separable 3-tap max (dilate) or min (erode).
function morph(mask: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const edge = dilate ? 0 : 1;
  const pick = dilate ? Math.max : Math.min;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      tmp[i] = pick(
        x > 0 ? (mask[i - 1] ?? 0) : edge,
        mask[i] ?? 0,
        x < w - 1 ? (mask[i + 1] ?? 0) : edge,
      );
    }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = pick(
        y > 0 ? (tmp[i - w] ?? 0) : edge,
        tmp[i] ?? 0,
        y < h - 1 ? (tmp[i + w] ?? 0) : edge,
      );
    }
  return out;
}

export interface Processed {
  /** 2550x3300 grayscale, values 0 or 255. */
  pixels: Uint8Array;
  rawGrayRatio: number;
  box: Box | null;
}

/** grayscale -> threshold -> close(1px) -> fit into the safe box (or full page when box=false) on white. */
export async function processImage(
  srcFile: string,
  outFile: string,
  threshold: number,
  useBox: boolean,
): Promise<Processed> {
  const box = useBox ? SAFE_BOX : { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
  const base = sharp(srcFile).flatten({ background: "#ffffff" }).greyscale();
  const rawGrayRatio = grayRatioOf(new Uint8Array(await base.clone().raw().toBuffer()));
  const { data, info } = await base
    .resize(box.w, box.h, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = (data[i] ?? 255) < threshold ? 1 : 0;
  const closed = morph(morph(mask, info.width, info.height, true), info.width, info.height, false);

  const pixels = new Uint8Array(PAGE_W * PAGE_H).fill(255);
  const ox = box.x + Math.floor((box.w - info.width) / 2);
  const oy = box.y + Math.floor((box.h - info.height) / 2);
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (closed[y * info.width + x]) pixels[(oy + y) * PAGE_W + ox + x] = 0;

  await sharp(Buffer.from(pixels), { raw: { width: PAGE_W, height: PAGE_H, channels: 1 } })
    .png({ compressionLevel: 9, palette: true, colours: 2 })
    .toFile(outFile);
  return { pixels, rawGrayRatio, box: useBox ? SAFE_BOX : null };
}

/** Front cover with bleed (8.625x11.25 in) at 300 DPI — the art is drawn full-bleed. */
export const COVER_W = 2588;
export const COVER_H = 3375;

export interface ProcessedCover {
  /** Share of saturated pixels (max-min channel spread > 60). */
  colorRatio: number;
  /** Share of near-white pixels (every channel > 235). */
  whiteRatio: number;
}

/** Full-colour cover art: crop-fill to the front cover with bleed, flatten to opaque RGB. No thresholding. */
export async function processCover(srcFile: string, outFile: string): Promise<ProcessedCover> {
  const { data, info } = await sharp(srcFile)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .resize(COVER_W, COVER_H, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let color = 0;
  let white = 0;
  const px = info.width * info.height;
  for (let i = 0; i < px; i++) {
    const r = data[i * 3] ?? 255;
    const g = data[i * 3 + 1] ?? 255;
    const b = data[i * 3 + 2] ?? 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) color++;
    if (r > 235 && g > 235 && b > 235) white++;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(outFile);
  return { colorRatio: color / (px || 1), whiteRatio: white / (px || 1) };
}

export interface CutOut {
  /** Share of the frame the character covers (tiny = the fill leaked through a gap in the outline). */
  opaqueRatio: number;
  /** The character touches the frame edge (it was cropped by the generator). */
  touchesEdge: boolean;
}

/**
 * Sticker cut-out: flood-fill the near-white background from the frame edge to transparent,
 * then trim to the character. White inside the character survives because the fill can't
 * cross its closed dark outline.
 */
export async function cutOut(srcFile: string, outFile: string): Promise<CutOut> {
  const { data, info } = await sharp(srcFile)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const white = (i: number): boolean =>
    Math.min(data[i * 3] ?? 0, data[i * 3 + 1] ?? 0, data[i * 3 + 2] ?? 0) >= 200;
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  let touchesEdge = false;
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  for (const i of stack) if (!white(i)) touchesEdge = true;
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    if (bg[i] || !white(i)) continue;
    bg[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  const rgba = Buffer.alloc(w * h * 4);
  let opaque = 0;
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 3] ?? 0;
    rgba[i * 4 + 1] = data[i * 3 + 1] ?? 0;
    rgba[i * 4 + 2] = data[i * 3 + 2] ?? 0;
    rgba[i * 4 + 3] = bg[i] ? 0 : 255;
    if (!bg[i]) opaque++;
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 0 })
    .png()
    .toFile(outFile);
  return { opaqueRatio: opaque / (w * h || 1), touchesEdge };
}
