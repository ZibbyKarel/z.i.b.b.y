import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import sharp from "sharp";
import { bookDirOf, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { PAGE_H_PT, PAGE_W_PT, coverSizeIn } from "./render.ts";
import type { RenderManifest } from "./render.ts";

/** Names of fonts that are used but have no embedded font program. */
function unembeddedFonts(doc: PDFDocument): string[] {
  const bad: string[] = [];
  const descriptorEmbedded = (d: PDFDict | undefined): boolean => {
    const fd = d?.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    return !!fd && ["FontFile", "FontFile2", "FontFile3"].some((k) => fd.has(PDFName.of(k)));
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    const sub = obj.get(PDFName.of("Subtype"));
    const name = obj.get(PDFName.of("BaseFont"))?.toString() ?? "?";
    if (sub === PDFName.of("Type0")) {
      const desc = obj.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
      const first = desc?.get(0);
      const dict = first instanceof PDFRef ? doc.context.lookup(first, PDFDict) : undefined;
      if (!descriptorEmbedded(dict)) bad.push(name);
    } else if (!descriptorEmbedded(obj)) bad.push(name);
  }
  return bad;
}

export async function preflight(argv: string[], ctx: Ctx): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { report: { type: "string", default: "preflight.md" } },
  });
  const book = bookDirOf(ctx);
  const errors: string[] = [];
  const warnings: string[] = [];
  let interiorPages = 0;
  let spineIn = 0;

  try {
    const manifest = readJson(path.join(book, "render-manifest.json")) as RenderManifest;
    const interior = await PDFDocument.load(fs.readFileSync(path.join(book, "interior.pdf")), {
      updateMetadata: false,
    });
    const cover = await PDFDocument.load(fs.readFileSync(path.join(book, "cover.pdf")), {
      updateMetadata: false,
    });
    interiorPages = interior.getPageCount();
    spineIn = interiorPages * coverSizeIn(1).spineIn;

    if (interiorPages !== manifest.expectedInteriorPages)
      errors.push(
        `interior has ${interiorPages} pages, expected ${manifest.expectedInteriorPages}`,
      );
    if (interiorPages < 24) warnings.push(`interior has ${interiorPages} pages; KDP minimum is 24`);
    if (interiorPages > 828) errors.push(`interior has ${interiorPages} pages; KDP maximum is 828`);
    interior.getPages().forEach((p, i) => {
      const { width, height } = p.getSize();
      if (Math.abs(width - PAGE_W_PT) > 0.01 || Math.abs(height - PAGE_H_PT) > 0.01)
        errors.push(
          `interior page ${i + 1} is ${width}x${height} pt, expected ${PAGE_W_PT}x${PAGE_H_PT}`,
        );
    });

    for (const img of manifest.images) {
      if (!fs.existsSync(img.file)) {
        errors.push(`image missing: ${img.file}`);
        continue;
      }
      const meta = await sharp(img.file).metadata();
      const dpi = Math.min(
        ((meta.width ?? 0) / img.drawnWidthPt) * 72,
        ((meta.height ?? 0) / img.drawnHeightPt) * 72,
      );
      if (dpi < 299.99)
        errors.push(
          `${img.file}: effective ${dpi.toFixed(0)} DPI < 300 (${meta.width}x${meta.height} px)`,
        );
      if (meta.hasAlpha) errors.push(`${img.file}: has an alpha channel (transparency)`);
    }

    for (const [label, doc] of [
      ["interior", interior],
      ["cover", cover],
    ] as const)
      for (const f of unembeddedFonts(doc)) errors.push(`${label}: font ${f} is not embedded`);

    const want = coverSizeIn(interiorPages);
    const cs = cover.getPage(0).getSize();
    if (
      Math.abs(cs.width / 72 - want.widthIn) > 0.01 ||
      Math.abs(cs.height / 72 - want.heightIn) > 0.01
    )
      errors.push(
        `cover is ${(cs.width / 72).toFixed(3)}x${(cs.height / 72).toFixed(3)} in, expected ${want.widthIn.toFixed(3)}x${want.heightIn.toFixed(3)}`,
      );
  } catch (e) {
    errors.push(`preflight could not run: ${(e as Error).message}`);
  }

  const passed = errors.length === 0;
  writeJson(path.join(book, "preflight.json"), {
    passed,
    errors,
    warnings,
    interiorPages,
    spineIn,
  });
  const list = (xs: string[]): string[] => (xs.length === 0 ? ["none"] : xs.map((x) => `- ${x}`));
  fs.writeFileSync(
    path.resolve(ctx.cwd, values.report),
    [
      "# Preflight report",
      "",
      `- interior pages: ${interiorPages}`,
      `- spine: ${spineIn.toFixed(4)} in`,
      "",
      "## Errors",
      "",
      ...list(errors),
      "",
      "## Warnings",
      "",
      ...list(warnings),
      "",
      passed ? "<verdict>pass</verdict>" : "<verdict>gap</verdict>",
      "",
    ].join("\n"),
  );
  for (const e of errors) console.error(`- ${e}`);
  console.log(
    `preflight: ${passed ? "passed" : "FAILED"} (${errors.length} errors, ${warnings.length} warnings)`,
  );
  return passed ? 0 : 1;
}
