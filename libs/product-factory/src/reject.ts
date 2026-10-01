import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { bookDirOf, nn } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";

/**
 * Un-approve pages so the next `produce` regenerates them (book-level QA found a
 * problem pixel QA could not). `0` is the cover. The old approved image is kept as
 * `rejected-NNN.png` beside the attempts; the reason is appended to `rejections.md`.
 */
export async function reject(argv: string[], ctx: Ctx): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { reason: { type: "string", default: "rejected by visual audit" } },
  });
  const pages = (positionals[0] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (pages.length === 0 || pages.some((n) => !Number.isInteger(n) || n < 0))
    throw new Error('usage: product-factory reject <pages e.g. "3,5" (0 = cover)> [--reason text]');

  const book = bookDirOf(ctx);
  const done: number[] = [];
  for (const n of pages) {
    const dir = n === 0 ? path.join(book, "cover-art") : path.join(book, "illustrations", nn(n));
    const approved = path.join(dir, "approved.png");
    if (!fs.existsSync(approved)) continue;
    let i = 1;
    while (fs.existsSync(path.join(dir, `rejected-${String(i).padStart(3, "0")}.png`))) i++;
    fs.renameSync(approved, path.join(dir, `rejected-${String(i).padStart(3, "0")}.png`));
    fs.rmSync(path.join(book, "qa", `${nn(n)}.json`), { force: true });
    done.push(n);
  }
  fs.appendFileSync(
    path.join(book, "rejections.md"),
    `- pages ${done.join(", ") || "(none approved)"}: ${values.reason}\n`,
  );
  console.log(`reject: ${done.length} page(s) un-approved`);
  return 0;
}
