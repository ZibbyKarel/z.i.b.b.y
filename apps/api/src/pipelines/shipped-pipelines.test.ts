import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { PipelineSchema } from "@zibby/contracts";

/**
 * The pipeline definitions ZIBBY actually ships live as markdown on disk, outside
 * any package's source tree — so nothing type-checks them and, until this file,
 * nothing tested them either. That gap is how the delivery pipeline shipped with a
 * `review` phase whose verdict the runner never read: `qualify` was simply absent,
 * and no test could tell the difference between "graded" and "exit-code only".
 *
 * Two guards here:
 *  1. Every shipped definition still satisfies `PipelineSchema` (which enforces, among
 *     other things, that a `qualify` phase is an agent phase AND has a loop to fall
 *     back to — see pipeline.schema.ts:221-236).
 *  2. The delivery pipeline's judging phases are actually gates.
 */
const PIPELINES_DIR = path.join(__dirname, "../../../../.zibby/data/pipelines");

function readPipeline(id: string) {
  const raw = fs.readFileSync(path.join(PIPELINES_DIR, `${id}.pipeline.md`), "utf8");
  const { data, content } = matter(raw);
  // `instructions` is the Markdown body, not a frontmatter key — mirrors
  // `PipelinesStorageService.fromFrontmatter` (pipelines.storage.service.ts:121-134),
  // which builds it from `body` the same way.
  const { avatar, ...rest } = data;
  const candidate: Record<string, unknown> = {
    ...rest,
    id,
    name: data.name ?? id,
    instructions: content.trim(),
  };
  // A bundled `/avatars/*.png` path or an inline `data:image/` URI validates as-is;
  // a bare on-disk asset ref (e.g. "assets/delivery.png") is resolved to one of
  // those by AvatarAssetsService at runtime (same file, `fromFrontmatter`) — that
  // resolution is irrelevant to what this test pins, so a bare ref is dropped
  // here rather than reimplemented.
  if (typeof avatar === "string" && (avatar.startsWith("data:image/") || avatar.startsWith("/"))) {
    candidate.avatar = avatar;
  }
  const parsed = PipelineSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`${id}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  return parsed.data;
}

function shippedIds(): string[] {
  return fs
    .readdirSync(PIPELINES_DIR)
    .filter((f) => f.endsWith(".pipeline.md"))
    .map((f) => f.replace(/\.pipeline\.md$/, ""));
}

describe("shipped pipeline definitions", () => {
  it("ships at least the delivery pipeline", () => {
    expect(shippedIds()).toContain("delivery");
  });

  it.each(shippedIds())("%s parses against PipelineSchema", (id) => {
    expect(() => readPipeline(id)).not.toThrow();
  });

  describe("delivery — the judging phases are gates, not exit-code checks", () => {
    it("grades the code reviewer's verdict, routing drift back to the architect", () => {
      const review = readPipeline("delivery").phases.find((p) => p.id === "review");
      expect(review).toBeDefined();
      expect(review?.qualify).toBe(true);
      // gap → fix in place; drift → re-plan. Without driftTo, drift would also land
      // on the coder, who cannot re-plan their way out of a wrong-direction verdict.
      expect(review?.loop?.to).toBe("koder");
      expect(review?.loop?.driftTo).toBe("architekt");
      expect(review?.loop?.then).toBe("park");
    });

    it("grades the test automator's verdict and gives it a back-edge to take", () => {
      const n9 = readPipeline("delivery").phases.find((p) => p.id === "n-9");
      expect(n9).toBeDefined();
      expect(n9?.qualify).toBe(true);
      expect(n9?.loop?.to).toBe("koder");
      expect(n9?.loop?.driftTo).toBe("architekt");
      expect(n9?.loop?.then).toBe("park");
      // Bounded, not infinite: the state machine parks rather than thrashing.
      expect(n9?.loop?.maxRetries).toBeGreaterThan(0);
    });

    it("keeps every qualify phase gradeable — it must produce the artifact it is graded on", () => {
      for (const phase of readPipeline("delivery").phases) {
        if (!phase.qualify) continue;
        // The runner reads the verdict tag out of `produces`
        // (pipeline-runner.service.ts:1009) — a qualify phase with nothing to produce
        // fails closed to `gap` on every single attempt.
        expect(phase.produces, `phase "${phase.id}" is qualify but produces nothing`).toBeTruthy();
      }
    });
  });
});
