import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { bookDirOf, readJson } from "./ctx.ts";
import type { CostLine, Ctx } from "./ctx.ts";
import { PlanSchema } from "./schemas.ts";

/** Every costs.jsonl under the run dir (all stage folders). */
export function collectCosts(root: string): CostLine[] {
  const lines: CostLine[] = [];
  for (const rel of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (rel.split(path.sep).includes("node_modules") || path.basename(rel) !== "costs.jsonl")
      continue;
    for (const l of fs.readFileSync(path.join(root, rel), "utf8").split("\n"))
      if (l.trim()) lines.push(JSON.parse(l) as CostLine);
  }
  return lines;
}

export async function finalize(argv: string[], ctx: Ctx): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { report: { type: "string", default: "book.md" } },
  });
  const listing = positionals[0];
  if (!listing) throw new Error("usage: product-factory finalize <listing.md> [--report book.md]");
  const book = bookDirOf(ctx);
  const plan = PlanSchema.parse(readJson(path.join(book, "plan.json")));
  fs.copyFileSync(path.resolve(ctx.cwd, listing), path.join(book, "listing.md"));

  const costs = collectCosts(ctx.env.ZIBBY_RUN_DIR ?? ctx.cwd);
  const total = costs.reduce((s, c) => s + c.costUsd, 0);
  const providers = [...new Set(costs.map((c) => `${c.provider}/${c.model}`))];
  const files = fs
    .readdirSync(book)
    .filter((f) => !f.startsWith("."))
    .sort();
  const created = ctx.env.PF_CREATED_AT ?? new Date().toISOString();

  fs.writeFileSync(
    path.join(book, "README.md"),
    [
      `# ${plan.title}`,
      "",
      plan.subtitle ?? "",
      "",
      `- theme: ${plan.brief.theme}`,
      `- ages: ${plan.brief.targetAge.min}-${plan.brief.targetAge.max}, language: ${plan.brief.language}`,
      `- coloring pages: ${plan.pages.length}, trim ${plan.brief.trim}`,
      `- total production cost: $${total.toFixed(4)}`,
      `- providers: ${providers.join(", ") || "none"}`,
      `- created: ${created}`,
      "",
      "## Files",
      "",
      ...files.map((f) => `- ${f}`),
      "",
      "Images are AI-generated — disclose on KDP.",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.resolve(ctx.cwd, values.report),
    `# Book ready\n\n${book}\n\nTotal production cost: $${total.toFixed(4)}\n`,
  );
  console.log(`finalize: ${book}`);
  return 0;
}
