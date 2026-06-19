import { describe, expect, it } from "vitest";
import {
  INITIAL_LOOP_STATE,
  type LoopFormState,
  buildCreateGoalBody,
  canSubmitLoop,
  decodeMaker,
  encodeMaker,
  makeGoalId,
  parseCommands,
  slugify,
} from "./loop";

/** A ready-to-submit Loop form, overridable per assertion. */
function loop(overrides: Partial<LoopFormState> = {}): LoopFormState {
  return {
    ...INITIAL_LOOP_STATE,
    objective: "All e2e tests pass",
    maker: encodeMaker("agent", "koder"),
    ...overrides,
  };
}

describe("encodeMaker / decodeMaker", () => {
  it("round-trips an agent maker", () => {
    expect(decodeMaker(encodeMaker("agent", "koder"))).toEqual({
      kind: "agent",
      id: "koder",
    });
  });

  it("round-trips a pipeline maker whose id contains the separator", () => {
    // Only the first colon splits kind from id — ids may themselves contain ':'.
    expect(decodeMaker(encodeMaker("pipeline", "deliver:web"))).toEqual({
      kind: "pipeline",
      id: "deliver:web",
    });
  });

  it("rejects the empty placeholder and malformed values", () => {
    expect(decodeMaker("")).toBeNull();
    expect(decodeMaker("agent:")).toBeNull();
    expect(decodeMaker("bogus:x")).toBeNull();
    expect(decodeMaker(":koder")).toBeNull();
  });
});

describe("slugify / makeGoalId", () => {
  it("produces a filename-safe lowercase-kebab slug, stripping diacritics", () => {
    expect(slugify("Zkontroluj zálohy na Holly!")).toBe("zkontroluj-zalohy-na-holly");
  });

  it("falls back to 'loop' and appends a base-36 time suffix for uniqueness", () => {
    expect(makeGoalId("", 0)).toBe("loop-0");
    const id = makeGoalId("Ship it", 123456789);
    expect(id).toMatch(/^ship-it-[a-z0-9]+$/);
  });

  it("keeps the seed within the 128-char id cap", () => {
    const id = makeGoalId("x".repeat(200), 1);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});

describe("parseCommands", () => {
  it("trims lines and drops blanks", () => {
    expect(parseCommands("  pnpm test \n\n pnpm typecheck \n")).toEqual([
      "pnpm test",
      "pnpm typecheck",
    ]);
  });
});

describe("canSubmitLoop", () => {
  it("accepts a complete checks-verifier form", () => {
    expect(canSubmitLoop(loop())).toBe(true);
  });

  it("rejects a too-short objective or an unset maker", () => {
    expect(canSubmitLoop(loop({ objective: "no" }))).toBe(false);
    expect(canSubmitLoop(loop({ maker: "" }))).toBe(false);
  });

  it("requires a reviewer only for the claude verifier", () => {
    expect(canSubmitLoop(loop({ verifierKind: "claude", reviewer: "" }))).toBe(false);
    expect(canSubmitLoop(loop({ verifierKind: "claude", reviewer: "reviewer" }))).toBe(true);
  });

  it("rejects a non-positive or non-integer iteration cap", () => {
    expect(canSubmitLoop(loop({ maxIterations: "0" }))).toBe(false);
    expect(canSubmitLoop(loop({ maxIterations: "2.5" }))).toBe(false);
    expect(canSubmitLoop(loop({ maxIterations: "" }))).toBe(false);
  });
});

describe("buildCreateGoalBody", () => {
  it("maps a checks form, omitting empty commands and defaulting instructions to the objective", () => {
    const body = buildCreateGoalBody(loop(), "goal-1", "  ");
    expect(body).toEqual({
      id: "goal-1",
      name: undefined,
      objective: "All e2e tests pass",
      maker: { kind: "agent", id: "koder" },
      verifier: { kind: "checks" },
      maxIterations: 5,
      instructions: "All e2e tests pass",
    });
  });

  it("includes parsed commands and a trimmed title/instructions when present", () => {
    const body = buildCreateGoalBody(
      loop({ commands: "pnpm test\npnpm lint", instructions: " follow CLAUDE.md " }),
      "goal-2",
      " Green CI ",
    );
    expect(body.name).toBe("Green CI");
    expect(body.verifier).toEqual({
      kind: "checks",
      commands: ["pnpm test", "pnpm lint"],
    });
    expect(body.instructions).toBe("follow CLAUDE.md");
  });

  it("maps a claude verifier to its reviewer agent", () => {
    const body = buildCreateGoalBody(
      loop({ verifierKind: "claude", reviewer: "reviewer" }),
      "goal-3",
      "",
    );
    expect(body.verifier).toEqual({ kind: "claude", agent: "reviewer" });
  });
});
