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
