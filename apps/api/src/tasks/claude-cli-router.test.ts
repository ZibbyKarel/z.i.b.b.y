import { describe, expect, it, vi } from "vitest";
import type { LoggerService } from "../shared/logging/logger.service";
import { ClaudeCliRouter } from "./claude-cli-router";
import type { RoutableTarget } from "./task-router";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
} as unknown as LoggerService;

/**
 * `ClaudeCliRouter.route` returns `null` unconditionally under the test runner (the
 * `process.env.VITEST` guard that keeps the e2e suite deterministic and off the
 * quota), so the parsing/validation core is only reachable through a subclass. This
 * exposes the two `protected` seams NS2 F10 touched.
 */
class TestableRouter extends ClaudeCliRouter {
  parse(raw: string) {
    return this.parseVerdict(raw);
  }

  runnerUp(reported: unknown, candidates: RoutableTarget[], chosen: RoutableTarget) {
    return this.resolveRunnerUp(reported as never, candidates, chosen);
  }
}

const department = (id: string, name: string): RoutableTarget =>
  ({ kind: "department", id, name, glyph: "grid", search: name }) as unknown as RoutableTarget;

const DEV = department("dev", "Dev");
const KNOWLEDGE = department("knw", "Knowledge");
const CANDIDATES = [DEV, KNOWLEDGE];

/** Wrap a verdict the way `--output-format json` does. */
function envelope(verdict: unknown): string {
  return JSON.stringify({ result: JSON.stringify(verdict) });
}

const BASE_VERDICT = {
  targetKind: "department",
  targetId: "dev",
  confidence: 0.9,
  reason: "delivery work",
  matchedTerms: ["rollout"],
};

describe("ClaudeCliRouter.parseVerdict — confidence (NS2 F10)", () => {
  const router = new TestableRouter(fakeLogger);

  it("keeps a reported confidence verbatim", () => {
    expect(router.parse(envelope(BASE_VERDICT))?.confidence).toBe(0.9);
  });

  it("REJECTS a verdict with no confidence instead of defaulting it to 0.5", () => {
    // The regression this guards: a silent 0.5 default turned a parse gap into a
    // routing decision the moment a threshold started reading the number — and 0.5
    // sits mid-scale, so it decided arbitrarily. Now the verdict is unusable and the
    // classifier falls through to the deterministic scorer instead.
    expect(
      router.parse(
        envelope({
          targetKind: "department",
          targetId: "dev",
          reason: "delivery work",
          matchedTerms: ["rollout"],
        }),
      ),
    ).toBeNull();
  });

  it("rejects a non-numeric or non-finite confidence the same way", () => {
    expect(router.parse(envelope({ ...BASE_VERDICT, confidence: "high" }))).toBeNull();
    expect(router.parse(envelope({ ...BASE_VERDICT, confidence: Number.NaN }))).toBeNull();
  });

  it("still rejects a verdict with no usable target, confidence present or not", () => {
    expect(router.parse(envelope({ ...BASE_VERDICT, targetId: "" }))).toBeNull();
    expect(router.parse(envelope({ ...BASE_VERDICT, targetKind: "wormhole" }))).toBeNull();
  });
});

describe("ClaudeCliRouter.parseVerdict — runnerUp (NS2 F10)", () => {
  const router = new TestableRouter(fakeLogger);

  it("parses a complete runner-up", () => {
    const parsed = router.parse(
      envelope({
        ...BASE_VERDICT,
        runnerUp: { targetKind: "department", targetId: "knw", confidence: 0.8, reason: "docs" },
      }),
    );
    expect(parsed?.runnerUp).toMatchObject({ targetId: "knw", confidence: 0.8 });
  });

  it("treats an absent or explicitly null runner-up as none", () => {
    expect(router.parse(envelope(BASE_VERDICT))?.runnerUp).toBeNull();
    expect(router.parse(envelope({ ...BASE_VERDICT, runnerUp: null }))?.runnerUp).toBeNull();
  });

  it("drops a half-shaped runner-up rather than computing a margin from it", () => {
    // A missing confidence would make the margin meaningless; the confidence floor
    // is the correct fallback signal, and it needs `null` here to take over.
    const noConfidence = router.parse(
      envelope({ ...BASE_VERDICT, runnerUp: { targetKind: "department", targetId: "knw" } }),
    );
    expect(noConfidence?.runnerUp).toBeNull();
    const noId = router.parse(
      envelope({ ...BASE_VERDICT, runnerUp: { targetKind: "department", confidence: 0.8 } }),
    );
    expect(noId?.runnerUp).toBeNull();
  });
});

describe("ClaudeCliRouter.resolveRunnerUp — catalog validation (NS2 F10)", () => {
  const router = new TestableRouter(fakeLogger);

  it("projects a catalog-backed runner-up onto the contract shape", () => {
    const resolved = router.runnerUp(
      { targetKind: "department", targetId: "knw", confidence: 0.8, reason: "docs work" },
      CANDIDATES,
      DEV,
    );
    // `toMatchObject`: `toTaskTarget` also emits `glyph`/`avatar`/`category` (the
    // latter two `undefined` here), which this assertion isn't about.
    expect(resolved).toMatchObject({
      target: { kind: "department", id: "knw", name: "Knowledge" },
      confidence: 0.8,
      reason: "docs work",
    });
  });

  it("drops a hallucinated runner-up without rejecting the whole verdict", () => {
    // The winner is independently validated, so a bogus alternative degrades to
    // "no alternative" instead of throwing the good pick away.
    expect(
      router.runnerUp(
        { targetKind: "department", targetId: "atlantis", confidence: 0.8, reason: "?" },
        CANDIDATES,
        DEV,
      ),
    ).toBeNull();
  });

  it("drops a runner-up that is the WINNER again (a zero margin would park everything)", () => {
    expect(
      router.runnerUp(
        { targetKind: "department", targetId: "dev", confidence: 0.9, reason: "same" },
        CANDIDATES,
        DEV,
      ),
    ).toBeNull();
  });

  it("clamps a runner-up confidence outside 0..1 onto the declared scale", () => {
    expect(
      router.runnerUp(
        { targetKind: "department", targetId: "knw", confidence: 4.2, reason: "eager" },
        CANDIDATES,
        DEV,
      )?.confidence,
    ).toBe(1);
  });
});
