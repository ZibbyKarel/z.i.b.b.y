import { describe, expect, it } from "vitest";
import {
  INITIAL_LOOP_STATE,
  type LoopFormState,
  buildCreateGoalBody,
  canSubmitLoop,
  decodeMaker,
  encodeMaker,
  makeGoalId,
  slugify,
} from "./loop";

/** A ready-to-submit Loop form, overridable per assertion. */
function loop(overrides: Partial<LoopFormState> = {}): LoopFormState {
  return {
    ...INITIAL_LOOP_STATE,
    objective: "All e2e tests pass",
    maker: encodeMaker("agent", "koder"),
    reviewer: "reviewer",
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

  it("round-trips a workflow maker whose id contains the separator", () => {
    // Only the first colon splits kind from id — ids may themselves contain ':'.
    expect(decodeMaker(encodeMaker("workflow", "deliver:web"))).toEqual({
      kind: "workflow",
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

describe("canSubmitLoop", () => {
  it("accepts a complete form", () => {
    expect(canSubmitLoop(loop())).toBe(true);
  });

  it("rejects a too-short objective or an unset maker", () => {
    expect(canSubmitLoop(loop({ objective: "no" }))).toBe(false);
    expect(canSubmitLoop(loop({ maker: "" }))).toBe(false);
  });

  it("requires a reviewer", () => {
    expect(canSubmitLoop(loop({ reviewer: "" }))).toBe(false);
  });

  it("rejects a non-positive or non-integer iteration cap", () => {
    expect(canSubmitLoop(loop({ maxIterations: "0" }))).toBe(false);
    expect(canSubmitLoop(loop({ maxIterations: "2.5" }))).toBe(false);
    expect(canSubmitLoop(loop({ maxIterations: "" }))).toBe(false);
  });
});

describe("buildCreateGoalBody", () => {
  it("maps the form to a claude-verified goal, defaulting instructions to the objective", () => {
    const body = buildCreateGoalBody(loop(), "goal-1", "  ");
    expect(body).toEqual({
      id: "goal-1",
      name: undefined,
      objective: "All e2e tests pass",
      maker: { kind: "agent", id: "koder" },
      verifier: { kind: "claude", agent: "reviewer" },
      maxIterations: 5,
      instructions: "All e2e tests pass",
    });
  });

  it("trims the title and instructions when present", () => {
    const body = buildCreateGoalBody(
      loop({ instructions: " follow CLAUDE.md " }),
      "goal-2",
      " Green CI ",
    );
    expect(body.name).toBe("Green CI");
    expect(body.instructions).toBe("follow CLAUDE.md");
  });
});
