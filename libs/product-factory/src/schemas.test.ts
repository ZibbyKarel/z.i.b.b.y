import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonArtifact } from "./artifact.ts";
import { BriefSchema, JobsSchema, PlanSchema } from "./schemas.ts";
import { tmpCtx } from "./testkit.ts";

describe("schemas", () => {
  it("applies brief defaults", () => {
    const b = BriefSchema.parse({ theme: "farm", targetAge: { min: 2, max: 4 }, pageCount: 24 });
    expect(b).toMatchObject({
      language: "en",
      style: "cute_simple_line_art",
      storyMode: false,
      trim: "8.5x11",
      listPriceUsd: 9.99,
      breakEvenCopies: 5,
    });
  });
  it("rejects min > max age and unknown keys", () => {
    expect(
      BriefSchema.safeParse({ theme: "x", targetAge: { min: 5, max: 3 }, pageCount: 24 }).success,
    ).toBe(false);
    expect(JobsSchema.safeParse({ jobs: [], extra: 1 }).success).toBe(false);
    expect(PlanSchema.safeParse({}).success).toBe(false);
  });
});

describe("readJsonArtifact", () => {
  const dir = tmpCtx().cwd;
  const w = (n: string, s: string): string => {
    const f = path.join(dir, n);
    fs.writeFileSync(f, s);
    return f;
  };
  it("reads raw JSON", () => expect(readJsonArtifact(w("a.json", '{"a":1}'))).toEqual({ a: 1 }));
  it("reads the first fenced json block", () =>
    expect(
      readJsonArtifact(w("b.md", 'text\n```json\n{"a":2}\n```\nmore\n```json\n{"a":3}\n```')),
    ).toEqual({ a: 2 }));
  it("errors clearly when there is no block", () =>
    expect(() => readJsonArtifact(w("c.md", "just prose"))).toThrow(/no fenced/));
});
