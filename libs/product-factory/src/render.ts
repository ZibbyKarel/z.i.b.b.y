import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { Color, PDFFont, PDFPage } from "pdf-lib";
import { bookDirOf, nn, pageFile, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { PlanSchema } from "./schemas.ts";
import type { Cover } from "./schemas.ts";

export const PT = 72;
export const PAGE_W_PT = 8.5 * PT;
export const PAGE_H_PT = 11 * PT;
export const SPINE_PER_PAGE_IN = 0.002252;
export const BLEED_IN = 0.125;
const FONT_FILE = fileURLToPath(new URL("../fonts/NotoSans-Regular.ttf", import.meta.url));
const FIXED_DATE = new Date("2000-01-01T00:00:00Z");
/** Cover colours when the plan leaves them out: sunny yellow wrap, white title with a navy outline. */
const COVER_DEFAULTS = { background: "#ffd23f", titleFill: "#ffffff", titleOutline: "#1f2a44" };

export interface ManifestImage {
  pdfPage: number;
  file: string;
  drawnWidthPt: number;
  drawnHeightPt: number;
}

export interface RenderManifest {
  singleSided: boolean;
  interiorPages: number;
  expectedInteriorPages: number;
  spineIn: number;
  coverWidthIn: number;
  coverHeightIn: number;
  images: ManifestImage[];
}

export const coverSizeIn = (
  interiorPages: number,
): { spineIn: number; widthIn: number; heightIn: number } => {
  const spineIn = interiorPages * SPINE_PER_PAGE_IN;
  return { spineIn, widthIn: 2 * 8.5 + spineIn + 2 * BLEED_IN, heightIn: 11 + 2 * BLEED_IN };
};

/** Keep only glyphs the embedded font has (Noto latin subset); strip diacritics as a fallback. */
function makeSafe(font: PDFFont, warnings: Set<string>) {
  const set = new Set(font.getCharacterSet());
  return (text: string): string => {
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 63;
      if (set.has(cp)) out += ch;
      else {
        const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
        const fixed = [...base].every((c) => set.has(c.codePointAt(0) ?? 0)) && base ? base : "?";
        out += fixed;
        warnings.add(`font has no glyph for "${ch}" (replaced with "${fixed}")`);
      }
    }
    return out;
  };
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && font.widthOfTextAtSize(next, size) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function centered(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  cx: number,
  topY: number,
  gap = 1.25,
  color: Color = rgb(0, 0, 0),
): number {
  let y = topY;
  for (const l of lines) {
    page.drawText(l, { x: cx - font.widthOfTextAtSize(l, size) / 2, y, size, font, color });
    y -= size * gap;
  }
  return y;
}

const hexRgb = (hex: string): Color =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );

/** Centered lines with a thick outline: the outline colour stamped in 16 directions, the fill on top. */
function outlined(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  cx: number,
  topY: number,
  fill: Color,
  outline: Color,
): number {
  const r = Math.max(1.5, size * 0.08);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    centered(page, font, lines, size, cx + r * Math.cos(a), topY + r * Math.sin(a), 1.1, outline);
  }
  return centered(page, font, lines, size, cx, topY, 1.1, fill);
}

/** The largest title size (56 down to 32) that wraps into at most three lines. */
function fitTitle(font: PDFFont, text: string, maxW: number): { lines: string[]; size: number } {
  for (let size = 56; size > 32; size -= 4) {
    const lines = wrap(font, text, size, maxW);
    if (lines.length <= 3) return { lines, size };
  }
  return { lines: wrap(font, text, 32, maxW), size: 32 };
}

/** Round sticker: white disc with an outline ring, label wrapped inside. */
function badge(
  page: PDFPage,
  font: PDFFont,
  label: string,
  cx: number,
  cy: number,
  r: number,
  ink: Color,
): void {
  page.drawCircle({ x: cx, y: cy, size: r, color: rgb(1, 1, 1), borderColor: ink, borderWidth: 4 });
  const size = 12;
  const lines = wrap(font, label, size, r * 1.5).slice(0, 3);
  const top = cy + ((lines.length - 1) * size * 1.15) / 2 - size * 0.35;
  centered(page, font, lines, size, cx, top, 1.15, ink);
}

async function newDoc(title: string): Promise<PDFDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer("zibby product-factory");
  doc.setCreator("zibby product-factory");
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  return doc;
}

export async function render(argv: string[], ctx: Ctx): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { report: { type: "string", default: "render-report.md" } },
  });
  const book = bookDirOf(ctx);
  const plan = PlanSchema.parse(readJson(path.join(book, "plan.json")));
  const singleSided = ctx.env.PF_SINGLE_SIDED === "true";
  const warnings = new Set<string>();

  const approved = plan.pages.map((p) => ({
    page: p,
    file: path.join(
      book,
      "illustrations",
      nn(p.pageNumber),
      pageFile(p.pageNumber, "approved.png"),
    ),
  }));
  const missing = approved.filter((a) => !fs.existsSync(a.file));
  if (missing.length > 0) {
    console.error(`missing approved pages: ${missing.map((m) => m.page.pageNumber).join(", ")}`);
    return 1;
  }

  const fontBytes = fs.readFileSync(FONT_FILE);
  const interior = await newDoc(plan.title);
  // subset:false -> no random subset tag in the font name, keeps the PDF byte-identical across runs.
  const font = await interior.embedFont(fontBytes, { subset: false });
  const safe = makeSafe(font, warnings);
  const images: ManifestImage[] = [];

  // Title page: text only — the cover art is full colour and the interior prints black and white.
  const title = interior.addPage([PAGE_W_PT, PAGE_H_PT]);
  const cx = PAGE_W_PT / 2;
  const ty = centered(title, font, wrap(font, safe(plan.title), 44, 460), 44, cx, 520, 1.2);
  if (plan.subtitle)
    centered(title, font, wrap(font, safe(plan.subtitle), 20, 460), 20, cx, ty - 6);

  for (const { page, file } of approved) {
    const pdfPage = interior.addPage([PAGE_W_PT, PAGE_H_PT]);
    const img = await interior.embedPng(fs.readFileSync(file));
    pdfPage.drawImage(img, { x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT });
    images.push({
      pdfPage: interior.getPageCount(),
      file,
      drawnWidthPt: PAGE_W_PT,
      drawnHeightPt: PAGE_H_PT,
    });
    if (page.caption) centered(pdfPage, font, [safe(page.caption)], 14, PAGE_W_PT / 2, 24);
    if (singleSided) interior.addPage([PAGE_W_PT, PAGE_H_PT]);
  }
  const interiorPages = interior.getPageCount();
  fs.mkdirSync(book, { recursive: true });
  fs.writeFileSync(
    path.join(book, "interior.pdf"),
    await interior.save({ useObjectStreams: false }),
  );

  // Cover wrap
  const { spineIn, widthIn, heightIn } = coverSizeIn(interiorPages);
  const cover = await newDoc(`${plan.title} (cover)`);
  const cfont = await cover.embedFont(fontBytes, { subset: false });
  const csafe = makeSafe(cfont, warnings);
  const cp = cover.addPage([widthIn * PT, heightIn * PT]);
  const bleed = BLEED_IN * PT;
  const frontX = bleed + 8.5 * PT + spineIn * PT; // left edge of the front cover trim
  const backCx = bleed + (8.5 * PT) / 2;
  const frontCx = frontX + (8.5 * PT) / 2;
  const coverTop = heightIn * PT - bleed;
  const colors: Required<Omit<Cover, "scene" | "badges">> = { ...COVER_DEFAULTS, ...plan.cover };
  const bg = hexRgb(colors.background);
  const ink = hexRgb(colors.titleOutline);
  const titleFill = hexRgb(colors.titleFill);
  // Whole wrap in the background colour, then the full-colour art full-bleed over the front panel.
  cp.drawRectangle({ x: 0, y: 0, width: widthIn * PT, height: heightIn * PT, color: bg });
  const artFile = path.join(book, "cover-art", "approved.png");
  let coverArt: ManifestImage | undefined;
  if (fs.existsSync(artFile)) {
    const art = await cover.embedPng(fs.readFileSync(artFile));
    const w = 8.5 * PT + bleed;
    const h = heightIn * PT;
    cp.drawImage(art, { x: frontX, y: 0, width: w, height: h });
    coverArt = { pdfPage: 1, file: artFile, drawnWidthPt: w, drawnHeightPt: h };
  } else warnings.add("no cover-art/approved.png — cover has title only");
  const { lines: titleLines, size: titleSize } = fitTitle(cfont, csafe(plan.title), 500);
  const subY = outlined(
    cp,
    cfont,
    titleLines,
    titleSize,
    frontCx,
    coverTop - 0.5 * PT - titleSize,
    titleFill,
    ink,
  );
  if (plan.subtitle)
    outlined(
      cp,
      cfont,
      wrap(cfont, csafe(plan.subtitle), 18, 460),
      18,
      frontCx,
      subY - 4,
      titleFill,
      ink,
    );
  const r = 44;
  (plan.cover.badges ?? []).forEach((label, i) =>
    badge(
      cp,
      cfont,
      csafe(label),
      frontX + 8.5 * PT - 0.375 * PT - r,
      bleed + 0.375 * PT + r + i * (2 * r + 8),
      r,
      ink,
    ),
  );

  // Back: a white panel with the blurb at the top (the bottom right stays free for the KDP barcode).
  const back: string[] = [];
  if (plan.subtitle) back.push(...wrap(cfont, csafe(plan.subtitle), 20, 440), "");
  back.push(
    csafe(`A coloring book for ages ${plan.brief.targetAge.min}-${plan.brief.targetAge.max}`),
  );
  const panelTop = coverTop - 0.75 * PT;
  const panelH = back.length * 20 * 1.25 + 40;
  cp.drawRectangle({
    x: bleed + 0.5 * PT,
    y: panelTop - panelH,
    width: 7.5 * PT,
    height: panelH,
    color: rgb(1, 1, 1),
    borderColor: ink,
    borderWidth: 4,
  });
  centered(cp, cfont, back, 20, backCx, panelTop - 20 - 20, 1.25, ink);
  if (interiorPages >= 79) {
    const size = Math.min(14, spineIn * PT * 0.6);
    const t = csafe(plan.title);
    cp.drawText(t, {
      x: bleed + 8.5 * PT + (spineIn * PT) / 2 + size / 3,
      y: coverTop - 40,
      size,
      font: cfont,
      rotate: degrees(-90),
      color: ink,
    });
  } else warnings.add(`no spine text: ${interiorPages} pages < 79 (KDP rule)`);
  fs.writeFileSync(path.join(book, "cover.pdf"), await cover.save({ useObjectStreams: false }));

  const manifest: RenderManifest = {
    singleSided,
    interiorPages,
    expectedInteriorPages: 1 + plan.pages.length * (singleSided ? 2 : 1),
    spineIn,
    coverWidthIn: widthIn,
    coverHeightIn: heightIn,
    images: [...images, ...(coverArt ? [coverArt] : [])],
  };
  writeJson(path.join(book, "render-manifest.json"), manifest);

  const report = [
    "# Render report",
    "",
    `- interior: ${path.join(book, "interior.pdf")} (${interiorPages} pages, ${singleSided ? "single-sided with blank backs" : "double-sided"})`,
    `- cover: ${path.join(book, "cover.pdf")} (${widthIn.toFixed(4)} x ${heightIn.toFixed(4)} in)`,
    `- spine width: ${spineIn.toFixed(4)} in`,
    "",
    "## Warnings",
    "",
    ...(warnings.size === 0 ? ["none"] : [...warnings].map((w) => `- ${w}`)),
    "",
  ].join("\n");
  fs.writeFileSync(path.resolve(ctx.cwd, values.report), report);
  console.log(`render: interior ${interiorPages} pages, spine ${spineIn.toFixed(4)} in`);
  return 0;
}
