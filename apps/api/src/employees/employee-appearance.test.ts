import type { MinionAppearance } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { allocateAppearance } from "./employee-appearance";

const key = (a: MinionAppearance) => JSON.stringify(a);

describe("allocateAppearance", () => {
  it("is deterministic", () => {
    const input = { seed: "Ziggy", category: "Core Development", agentId: "koder" };
    expect(allocateAppearance(input, [])).toEqual(allocateAppearance(input, []));
  });

  it("maps category to hat/tie", () => {
    const a = (category?: string) =>
      allocateAppearance({ seed: "x", ...(category ? { category } : {}), agentId: "a" }, []);
    expect(a("Core Development").hat).toBe("headphones");
    expect(a("Infrastructure").hat).toBe("hardhat");
    expect(a("Quality & Security").hat).toBe("beanie");
    expect(a("Meta & Orchestration").hat).toBe("hardhat");
    expect(a("Developer Experience").hat).toBe("beanie");
    const biz = a("Business & Product");
    expect(biz.hat).toBeUndefined();
    expect(biz.tie).toBe(true);
    expect(a("Roadmap").hat).toBeUndefined();
    expect(a().tie).toBeUndefined();
  });

  it("skips taken appearances", () => {
    const input = { seed: "Ziggy", category: "Infrastructure", agentId: "k" };
    const first = allocateAppearance(input, []);
    const second = allocateAppearance(input, [first]);
    expect(key(second)).not.toBe(key(first));
  });

  it("stays unique over 200 allocations", () => {
    const taken: MinionAppearance[] = [];
    for (let i = 0; i < 200; i++) {
      taken.push(
        allocateAppearance(
          { seed: `n${i % 7}`, category: "Core Development", agentId: "k" },
          taken,
        ),
      );
    }
    expect(new Set(taken.map(key)).size).toBe(200);
  });

  it("falls back to the hash combo when exhausted", () => {
    const taken: MinionAppearance[] = [];
    for (let i = 0; i < 960; i++) {
      taken.push(allocateAppearance({ seed: "s", agentId: "k" }, taken));
    }
    expect(new Set(taken.map(key)).size).toBe(960);
    expect(allocateAppearance({ seed: "s", agentId: "k" }, taken)).toEqual(taken[0]);
  });
});
