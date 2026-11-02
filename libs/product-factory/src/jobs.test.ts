import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { readJson, writeJson } from "./ctx.ts";
import { JobsSchema, PlanSchema } from "./schemas.ts";
import { tmpCtx } from "./testkit.ts";

const plan = PlanSchema.parse({
  brief: { theme: "animals", targetAge: { min: 2, max: 4 }, pageCount: 4 },
  title: "Animals",
  styleGuide: "bold",
  cover: { scene: "colourful zoo" },
  pages: [1, 2, 3, 4].map((n) => ({
    pageNumber: n,
    scene: `scene number ${n}`,
    subjects: ["x"],
    difficulty: 1,
  })),
});

describe("jobs", () => {
  it("builds a valid jobs.json from plan.json", async () => {
    const ctx = tmpCtx();
    writeJson(path.join(ctx.cwd, "book", "plan.json"), plan);
    expect(await main(["jobs", "--report", "r.md"], ctx)).toBe(0);
    const j = JobsSchema.parse(readJson(path.join(ctx.cwd, "jobs.json")));
    expect(j.cover?.prompt).toBe("colourful zoo");
    expect(j.jobs.map((x) => x.prompt)).toEqual([1, 2, 3, 4].map((n) => `scene number ${n}`));
    expect(fs.existsSync(path.join(ctx.cwd, "book", "jobs.json"))).toBe(true);
    expect(fs.readFileSync(path.join(ctx.cwd, "r.md"), "utf8")).toContain(
      "<verdict>pass</verdict>",
    );
  });
});
