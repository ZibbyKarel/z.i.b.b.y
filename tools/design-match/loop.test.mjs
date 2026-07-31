import { describe, expect, it } from "vitest";
import { decideNext, evaluateRound } from "./loop.mjs";

const pass = { pass: true, findings: [] };
const fail = {
  pass: false,
  findings: [{ path: "form", kind: "layout-mode", message: "grid vs flex-column" }],
};

describe("evaluateRound", () => {
  it("stops before pixels when the skeleton gate fails", () => {
    const verdict = evaluateRound({ skeleton: fail, values: null, pixels: null });
    expect(verdict).toMatchObject({ status: "continue" });
    expect(verdict.reason).toContain("skeleton");
  });

  it("is done when skeleton passes, diff is under 0.5 % and no region exceeds 4×4", () => {
    const verdict = evaluateRound({
      skeleton: pass,
      values: [],
      pixels: { percent: 0.3, largestRegion: { w: 3, h: 4 }, diffBuffer: Buffer.alloc(0) },
    });
    expect(verdict.status).toBe("done");
  });

  it("is not done when a contiguous region exceeds 4×4 even at a low percentage", () => {
    const verdict = evaluateRound({
      skeleton: pass,
      values: [],
      pixels: { percent: 0.2, largestRegion: { w: 40, h: 30 }, diffBuffer: Buffer.alloc(0) },
    });
    expect(verdict.status).toBe("continue");
    expect(verdict.reason).toContain("40×30");
  });
});

describe("decideNext", () => {
  it("stops once two rounds in the run have failed the skeleton gate, consecutive or not", () => {
    const result = decideNext(
      [],
      [
        { percent: null, skeletonPass: false },
        { percent: null, skeletonPass: false },
      ],
    );
    expect(result).toMatchObject({ stop: true });
    expect(result.reason).toContain("skeleton");
  });

  it("stops on two skeleton failures even with a passing round between them", () => {
    // Pins the semantics documented above: the count is over the whole run, not
    // a consecutive-failure streak. Fail, pass, fail must still stop.
    const result = decideNext(
      [],
      [
        { percent: 8, skeletonPass: false },
        { percent: 6, skeletonPass: true },
        { percent: null, skeletonPass: false },
      ],
    );
    expect(result).toMatchObject({ stop: true });
    expect(result.reason).toContain("skeleton");
  });

  it("stops at the 5-round ceiling", () => {
    const rounds = Array.from({ length: 5 }, (_, i) => ({
      percent: 10 - i * 2,
      skeletonPass: true,
    }));
    expect(decideNext([], rounds)).toMatchObject({
      stop: true,
      reason: expect.stringContaining("5 kol"),
    });
  });

  it("stops when the diff stops falling by at least 20 % relative", () => {
    const result = decideNext(
      [],
      [
        { percent: 1.0, skeletonPass: true },
        { percent: 0.9, skeletonPass: true },
      ],
    );
    expect(result).toMatchObject({ stop: true });
    expect(result.reason).toContain("thrash");
  });

  /*
   * I5 (task 20), the fourth surviving mutant: deleting `previous.percent > 0`
   * from `decideNext` left all 329 tests green, and it is NOT an equivalent
   * mutant — the divisor becomes 0, the drop becomes -Infinity, and the round
   * parks for "thrash" on the strength of arithmetic rather than evidence.
   *
   * The state is reachable, which is the whole reason the guard is there:
   * `percent` is rounded to two decimals, so a handful of differing pixels on a
   * large image rounds to 0 while `largestRegion` is still over 4×4 — a round
   * that continues at 0 % — and the next round regressing gives the division.
   * SKILL.md states the precondition in as many words.
   */
  it("never parks for thrash on a round following a 0 % one — that division is arithmetic, not evidence", () => {
    expect(
      decideNext(
        [],
        [
          { percent: 0, skeletonPass: true },
          { percent: 0.3, skeletonPass: true },
        ],
      ),
    ).toEqual({ stop: false, reason: "pokračuje" });
  });

  it("continues while the diff is still falling fast", () => {
    expect(
      decideNext(
        [],
        [
          { percent: 10, skeletonPass: true },
          { percent: 4, skeletonPass: true },
        ],
      ),
    ).toMatchObject({ stop: false });
  });
});
