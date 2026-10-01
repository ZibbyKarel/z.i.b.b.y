import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readJsonArtifact } from "./artifact.ts";
import { planCheck } from "./plan-check.ts";
import type { Plan } from "./schemas.ts";
import { fixture, tmpCtx } from "./testkit.ts";

const base = (): Plan => readJsonArtifact(fixture("farm-4", "content-plan.md")) as Plan;

async function check(plan: Plan): Promise<{ code: number; md: string }> {
  const ctx = tmpCtx();
  fs.writeFileSync(path.join(ctx.cwd, "p.json"), JSON.stringify(plan));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const code = await planCheck(["p.json"], ctx);
  const f = path.join(ctx.cwd, "plan-check.md");
  return { code, md: fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "" };
}

describe("plan check", () => {
  it("passes the valid fixtures and writes plan.json to cwd and book", async () => {
    for (const name of ["farm-4", "farm-10"]) {
      const ctx = tmpCtx();
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      expect(await planCheck([fixture(name, "content-plan.md")], ctx)).toBe(0);
      expect(fs.existsSync(path.join(ctx.cwd, "plan.json"))).toBe(true);
      expect(fs.existsSync(path.join(ctx.cwd, "book", "plan.json"))).toBe(true);
    }
  });
  it("fails on duplicate scenes (incl. near-duplicates)", async () => {
    const p = base();
    p.pages[1]!.scene = "A smiling cow standing in a grassy meadow!";
    const r = await check(p);
    expect(r.code).toBe(1);
    expect(r.md).toMatch(/duplicate scenes: page 1 and page 2/);
  });
  it("fails on banned terms", async () => {
    const p = base();
    p.pages[2]!.scene = "a hen meeting Peppa near a nest";
    const r = await check(p);
    expect(r.code).toBe(1);
    expect(r.md).toMatch(/banned term "Peppa" in page 3 scene/);
  });
  it("fails on page count mismatch", async () => {
    const p = base();
    p.brief.pageCount = 5;
    const r = await check(p);
    expect(r.code).toBe(1);
    expect(r.md).toMatch(/pageCount/);
  });
});
