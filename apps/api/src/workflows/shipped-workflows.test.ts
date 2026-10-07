import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { WorkflowSchema } from "@zibby/contracts";

/**
 * The workflow definitions ZIBBY actually ships live as markdown on disk, outside
 * any package's source tree — so nothing type-checks them and, until this file,
 * nothing tested them either. That gap is how the delivery workflow shipped with a
 * `review` phase whose verdict the runner never read: `qualify` was simply absent,
 * and no test could tell the difference between "graded" and "exit-code only".
 *
 * Two guards here:
 *  1. Every shipped definition still satisfies `WorkflowSchema` (which enforces, among
 *     other things, that a `qualify` phase is an agent phase AND has a loop to fall
 *     back to — see workflow.schema.ts:221-236).
 *  2. The delivery workflow's judging phases are actually gates.
 */
const WORKFLOWS_DIR = path.join(__dirname, "../../../../.zibby/data/workflows");

function readWorkflow(id: string) {
  const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, `${id}.workflow.md`), "utf8");
  const { data, content } = matter(raw);
  // `instructions` is the Markdown body, not a frontmatter key — mirrors
  // `WorkflowsStorageService.fromFrontmatter` (workflows.storage.service.ts:121-134),
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
  const parsed = WorkflowSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`${id}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  return parsed.data;
}

function shippedIds(): string[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".workflow.md"))
    .map((f) => f.replace(/\.workflow\.md$/, ""));
}

describe("shipped workflow definitions", () => {
  it("ships at least the delivery workflow", () => {
    expect(shippedIds()).toContain("delivery");
  });

  it.each(shippedIds())("%s parses against WorkflowSchema", (id) => {
    expect(() => readWorkflow(id)).not.toThrow();
  });

  describe("every shipped workflow — a judging phase with a back-edge is a gate", () => {
    // An agent phase with a `loop` but no `qualify` only takes its back-edge on a
    // non-zero exit: whatever the reviewer/editor/validator concluded is never read.
    // That is the bug the delivery fix (549e74b1) closed for one workflow; this pins
    // it for all of them. A looped agent phase that is a PRODUCER (its loop is a plain
    // retry-on-failure, not a judgement) must be listed here with the reason.
    const EXIT_CODE_LOOPS = new Map<string, string>([
      ["research/synthesize", "producer; its report is graded downstream by `refute`"],
    ]);

    const agentPhases = () =>
      shippedIds().flatMap((id) =>
        readWorkflow(id)
          .phases.filter((p) => p.type === "agent")
          .map((p) => ({ key: `${id}/${p.id}`, phase: p })),
      );

    it("grades every looped agent phase unless it is an allowlisted producer", () => {
      const ungraded = agentPhases()
        .filter(({ key, phase }) => phase.loop && !phase.qualify && !EXIT_CODE_LOOPS.has(key))
        .map(({ key }) => key);
      expect(ungraded, "looped agent phases whose verdict is never read").toEqual([]);
    });

    it("grades every phase named review", () => {
      const ungraded = agentPhases()
        .filter(({ phase }) => phase.id === "review" && !phase.qualify)
        .map(({ key }) => key);
      expect(ungraded).toEqual([]);
    });

    it("makes every qualify phase produce the artifact it is graded on", () => {
      // The runner reads the verdict tag out of `produces`; without one it fails
      // closed to `gap` on every attempt.
      const blind = agentPhases()
        .filter(({ phase }) => phase.qualify && !phase.produces)
        .map(({ key }) => key);
      expect(blind).toEqual([]);
    });

    it("keeps the producer allowlist honest — no stale or since-graded entries", () => {
      const live = new Map(agentPhases().map(({ key, phase }) => [key, phase]));
      for (const key of EXIT_CODE_LOOPS.keys()) {
        const phase = live.get(key);
        expect(phase?.loop, `${key} no longer exists or no longer loops`).toBeDefined();
        expect(phase?.qualify, `${key} is graded now — drop it from the allowlist`).toBeFalsy();
      }
    });
  });

  describe("delivery — the judging phases are gates, not exit-code checks", () => {
    it("grades the code reviewer's verdict, routing drift back to the architect", () => {
      const review = readWorkflow("delivery").phases.find((p) => p.id === "review");
      expect(review).toBeDefined();
      expect(review?.qualify).toBe(true);
      // gap → fix in place; drift → re-plan. Without driftTo, drift would also land
      // on the coder, who cannot re-plan their way out of a wrong-direction verdict.
      expect(review?.loop?.to).toBe("koder");
      expect(review?.loop?.driftTo).toBe("architekt");
      expect(review?.loop?.then).toBe("park");
    });

    it("grades the test automator's verdict and gives it a back-edge to take", () => {
      const n9 = readWorkflow("delivery").phases.find((p) => p.id === "n-9");
      expect(n9).toBeDefined();
      expect(n9?.qualify).toBe(true);
      expect(n9?.loop?.to).toBe("koder");
      expect(n9?.loop?.driftTo).toBe("architekt");
      expect(n9?.loop?.then).toBe("park");
      // Bounded, not infinite: the state machine parks rather than thrashing.
      expect(n9?.loop?.maxRetries).toBeGreaterThan(0);
    });

    it("keeps every qualify phase gradeable — it must produce the artifact it is graded on", () => {
      for (const phase of readWorkflow("delivery").phases) {
        if (!phase.qualify) continue;
        // The runner reads the verdict tag out of `produces`
        // (workflow-runner.service.ts:1009) — a qualify phase with nothing to produce
        // fails closed to `gap` on every single attempt.
        expect(phase.produces, `phase "${phase.id}" is qualify but produces nothing`).toBeTruthy();
      }
    });
  });

  describe("research — a skeptic grades the conclusions before they leave R&D", () => {
    it("ends with a qualify refute phase that attacks the synthesized report", () => {
      const phases = readWorkflow("research").phases;
      const refute = phases.find((p) => p.id === "refute");
      expect(refute).toBeDefined();
      expect(phases.at(-1)?.id).toBe("refute");
      expect(refute?.agent).toBe("research-skeptic");
      expect(refute?.consumes).toBe("report.md");
      expect(refute?.produces).toBe("refuted.md");
      expect(refute?.qualify).toBe(true);
      // gap → the synthesis overreaches, rewrite it; drift → the evidence base itself
      // is one-sided, go back to collecting sources.
      expect(refute?.loop?.to).toBe("synthesize");
      expect(refute?.loop?.driftTo).toBe("scan");
      expect(refute?.loop?.then).toBe("park");
      expect(refute?.loop?.maxRetries).toBeGreaterThan(0);
    });

    it("has a hired R&D employee for the skeptic, so the stage never parks on NoEmployeeError", () => {
      const file = path.join(WORKFLOWS_DIR, "../employees/employee_research-skeptic.json");
      const employee = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      expect(employee).toMatchObject({
        agentId: "research-skeptic",
        department: "rnd",
        status: "active",
      });
      expect(fs.existsSync(path.join(WORKFLOWS_DIR, "../agents/research-skeptic.md"))).toBe(true);
    });
  });
});
