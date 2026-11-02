import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { bookDirOf, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { JobsSchema, PlanSchema } from "./schemas.ts";

/**
 * Jobs straight from book/plan.json: each page's prompt is its `scene`, the cover's is
 * `cover.scene`. For workflows whose scenes are already complete image prompts (no illustrator
 * agent). Written to --out (relative to cwd) and to book/jobs.json, where `produce` keeps it.
 */
export async function jobs(argv: string[], ctx: Ctx): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string", default: "jobs.json" },
      report: { type: "string", default: "jobs-report.md" },
    },
  });
  const book = bookDirOf(ctx);
  const plan = PlanSchema.parse(readJson(path.join(book, "plan.json")));
  const out = JobsSchema.parse({
    cover: { prompt: plan.cover.scene },
    jobs: plan.pages.map((p) => ({ pageNumber: p.pageNumber, prompt: p.scene })),
  });
  writeJson(path.resolve(ctx.cwd, values.out), out);
  writeJson(path.join(book, "jobs.json"), out);
  fs.writeFileSync(
    path.resolve(ctx.cwd, values.report),
    `# Jobs\n\n- pages: ${out.jobs.length}\n- cover: yes\n- file: ${path.join(book, "jobs.json")}\n\n<verdict>pass</verdict>\n`,
  );
  console.log(`jobs: ${out.jobs.length} page job(s) + cover`);
  return 0;
}
