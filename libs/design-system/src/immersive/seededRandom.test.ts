import { describe, expect, it } from "vitest";
import { seededRandom } from "./seededRandom";

describe("seededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = seededRandom("scout");
    const b = seededRandom("scout");
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqB).toEqual(seqA);
  });

  it("produces a different first value for a different seed", () => {
    const a = seededRandom("scout");
    const b = seededRandom("forge");
    expect(a()).not.toBe(b());
  });

  it("always returns values in [0, 1)", () => {
    const r = seededRandom("idle-sys");
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
