import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readJsonArtifact } from "./artifact.ts";
import { BANNED_TERMS } from "./banned-terms.ts";
import { bookDirOf, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { PlanSchema } from "./schemas.ts";
import type { Plan } from "./schemas.ts";

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const jaccard = (a: string, b: string): number => {
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter || 1);
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pure validation of an already-schema-valid plan; returns every problem found. */
export function checkPlan(plan: Plan): string[] {
  const problems: string[] = [];
  const { pages, brief } = plan;
  if (pages.length !== brief.pageCount)
    problems.push(`pages.length (${pages.length}) !== brief.pageCount (${brief.pageCount})`);
  const nums = pages.map((p) => p.pageNumber);
  if (nums.some((n, i) => n !== i + 1))
    problems.push(`pageNumbers must be contiguous 1..${pages.length}, got [${nums.join(",")}]`);

  const scenes = pages.map((p) => ({ n: p.pageNumber, s: normalize(p.scene) }));
  for (let i = 0; i < scenes.length; i++)
    for (let j = i + 1; j < scenes.length; j++) {
      const a = scenes[i];
      const b = scenes[j];
      if (!a || !b) continue;
      if (a.s === b.s || jaccard(a.s, b.s) >= 0.8)
        problems.push(`duplicate scenes: page ${a.n} and page ${b.n}`);
    }

  const fields: [string, string][] = [
    ["brief.theme", brief.theme],
    ["brief.title", brief.title ?? ""],
    ["title", plan.title],
    ["subtitle", plan.subtitle ?? ""],
    ["styleGuide", plan.styleGuide],
    ["cover.scene", plan.cover.scene],
    ...pages.flatMap((p): [string, string][] => [
      [`page ${p.pageNumber} scene`, p.scene],
      [`page ${p.pageNumber} caption`, p.caption ?? ""],
    ]),
  ];
  for (const term of BANNED_TERMS) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, "iu");
    for (const [where, text] of fields)
      if (re.test(text)) problems.push(`banned term "${term}" in ${where}`);
  }
  return [...new Set(problems)];
}

export async function planCheck(argv: string[], ctx: Ctx): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string", default: "plan.json" } },
  });
  const input = positionals[0];
  if (!input)
    throw new Error("usage: product-factory plan check <content-plan.md> [--out plan.json]");

  let problems: string[];
  let plan: Plan | undefined;
  const parsed = PlanSchema.safeParse(readJsonArtifact(path.resolve(ctx.cwd, input)));
  if (parsed.success) {
    plan = parsed.data;
    problems = checkPlan(plan);
  } else {
    problems = parsed.error.issues.map(
      (i) => `schema: ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
  }

  if (problems.length > 0 || !plan) {
    for (const p of problems) console.error(`- ${p}`);
    fs.writeFileSync(
      path.join(ctx.cwd, "plan-check.md"),
      `# Plan check failed\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\n<verdict>gap</verdict>\n`,
    );
    return 1;
  }
  writeJson(path.resolve(ctx.cwd, values.out), plan);
  writeJson(path.join(bookDirOf(ctx), "plan.json"), plan);
  console.log(
    `plan ok: "${plan.title}", ${plan.pages.length} pages, ages ${plan.brief.targetAge.min}-${plan.brief.targetAge.max}`,
  );
  return 0;
}
