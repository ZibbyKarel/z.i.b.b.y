import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { bookDirOf, nn, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { PlanSchema } from "./schemas.ts";

export const PT = 72;
export const PAGE_W_PT = 8.5 * PT;
export const PAGE_H_PT = 11 * PT;
export const SPINE_PER_PAGE_IN = 0.002252;
export const BLEED_IN = 0.125;
const FONT_FILE = fileURLToPath(new URL("../fonts/NotoSans-Regular.ttf", import.meta.url));
const FIXED_DATE = new Date("2000-01-01T00:00:00Z");

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
): number {
  let y = topY;
  for (const l of lines) {
    page.drawText(l, {
      x: cx - font.widthOfTextAtSize(l, size) / 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    y -= size * gap;
  }
  return y;
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
  const singleSided = (ctx.env.PF_SINGLE_SIDED ?? "true") !== "false";
  const warnings = new Set<string>();

  const approved = plan.pages.map((p) => ({
    page: p,
    file: path.join(book, "illustrations", nn(p.pageNumber), "approved.png"),
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

  const title = interior.addPage([PAGE_W_PT, PAGE_H_PT]);
  const y = centered(title, font, wrap(font, safe(plan.title), 36, 468), 36, PAGE_W_PT / 2, 560);
  if (plan.subtitle)
    centered(title, font, wrap(font, safe(plan.subtitle), 18, 468), 18, PAGE_W_PT / 2, y - 12);
  centered(
    title,
    font,
    [safe("This book belongs to: ____________________")],
    16,
    PAGE_W_PT / 2,
    160,
  );

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
  centered(cp, cfont, wrap(cfont, csafe(plan.title), 40, 440), 40, frontCx, coverTop - 70);
  const artFile = path.join(book, "cover-art", "approved.png");
  let coverArt: ManifestImage | undefined;
  if (fs.existsSync(artFile)) {
    const art = await cover.embedPng(fs.readFileSync(artFile));
    const h = 7.6 * PT;
    const w = (h * 2550) / 3300;
    cp.drawImage(art, { x: frontCx - w / 2, y: bleed + 0.4 * PT, width: w, height: h });
    coverArt = { pdfPage: 1, file: artFile, drawnWidthPt: w, drawnHeightPt: h };
  } else warnings.add("no cover-art/approved.png — cover has title only");
  const back: string[] = [];
  if (plan.subtitle) back.push(...wrap(cfont, csafe(plan.subtitle), 20, 400), "");
  back.push(
    csafe(`A coloring book for ages ${plan.brief.targetAge.min}-${plan.brief.targetAge.max}`),
  );
  centered(cp, cfont, back, 20, backCx, coverTop - 140);
  if (interiorPages >= 79) {
    const size = Math.min(14, spineIn * PT * 0.6);
    const t = csafe(plan.title);
    cp.drawText(t, {
      x: bleed + 8.5 * PT + (spineIn * PT) / 2 + size / 3,
      y: coverTop - 40,
      size,
      font: cfont,
      rotate: degrees(-90),
      color: rgb(0, 0, 0),
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
