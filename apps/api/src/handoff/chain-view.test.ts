import type {
  Chain,
  ChainInput,
  DepartmentId,
  HandoffRule,
  HandoffSignalKind,
} from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { MAX_CHAIN_STEPS, chainToRules, deriveChain, validateChainInput } from "./chain-view";

function kind(overrides: Partial<HandoffSignalKind> = {}): HandoffSignalKind {
  return {
    id: "c1",
    from: "rnd",
    label: "Test chain",
    description: "A test chain.",
    severityBearing: false,
    status: "active",
    chain: true,
    entry: "rnd",
    ...overrides,
  };
}

function rule(overrides: Partial<HandoffRule> = {}): HandoffRule {
  return {
    id: "c1:0",
    from: "rnd",
    signalKind: "c1",
    to: { kind: "department", id: "dev" },
    tier: 2,
    enabled: true,
    ...overrides,
  };
}

describe("deriveChain", () => {
  it("returns null for a non-chain kind", () => {
    expect(deriveChain(kind({ chain: undefined, entry: undefined }), [])).toBeNull();
  });

  it("returns null for a chain kind missing its entry", () => {
    expect(deriveChain(kind({ entry: undefined }), [])).toBeNull();
  });

  it("walks a linear route entry -> dev -> rel", () => {
    const rules: HandoffRule[] = [
      rule({ id: "c1:0", from: "rnd", to: { kind: "department", id: "dev" }, tier: 2 }),
      rule({ id: "c1:1", from: "dev", to: { kind: "department", id: "rel" }, tier: 3 }),
    ];
    const chain = deriveChain(kind(), rules);
    expect(chain).toEqual({
      id: "c1",
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [
        { department: "dev", gate: "auto", ruleId: "c1:0" },
        { department: "rel", gate: "ask", ruleId: "c1:1" },
      ],
      enabled: true,
    } satisfies Chain);
  });

  it("stops at the first missing hop — a chain of 1 step when only 1 rule exists", () => {
    const rules: HandoffRule[] = [rule({ id: "c1:0" })];
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps).toHaveLength(1);
  });

  it("stops at a non-department target", () => {
    const rules: HandoffRule[] = [
      rule({ id: "c1:0", to: { kind: "pipeline", id: "some-pipeline" } as never }),
    ];
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps).toHaveLength(0);
    expect(chain?.enabled).toBe(false);
  });

  it("stops at a cycle back to an already-visited department", () => {
    const rules: HandoffRule[] = [
      rule({ id: "c1:0", from: "rnd", to: { kind: "department", id: "dev" } }),
      rule({ id: "c1:1", from: "dev", to: { kind: "department", id: "rnd" } }),
    ];
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps).toEqual([{ department: "dev", gate: "auto", ruleId: "c1:0" }]);
  });

  it("ignores rules belonging to a different signal kind", () => {
    const rules: HandoffRule[] = [rule({ id: "other:0", signalKind: "other" })];
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps).toHaveLength(0);
  });

  it("is disabled when no step resolved", () => {
    const chain = deriveChain(kind(), []);
    expect(chain?.enabled).toBe(false);
  });

  it("is disabled when any hop's rule is disabled (mixed/hand-edited file)", () => {
    const rules: HandoffRule[] = [
      rule({ id: "c1:0", from: "rnd", to: { kind: "department", id: "dev" }, enabled: true }),
      rule({ id: "c1:1", from: "dev", to: { kind: "department", id: "rel" }, enabled: false }),
    ];
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps).toHaveLength(2);
    expect(chain?.enabled).toBe(false);
  });

  it("caps the walk at MAX_CHAIN_STEPS hops even if the rule set has more", () => {
    const departments: DepartmentId[] = [
      "rnd",
      "dev",
      "ops",
      "sec",
      "rel",
      "inc",
      "com",
      "qa",
      "knw",
      "fin",
      "per",
    ];
    const rules: HandoffRule[] = [];
    for (let i = 0; i < departments.length - 1; i += 1) {
      rules.push(
        rule({
          id: `c1:${i}`,
          from: departments[i] as DepartmentId,
          to: { kind: "department", id: departments[i + 1] as DepartmentId },
        }),
      );
    }
    const chain = deriveChain(kind(), rules);
    expect(chain?.steps.length).toBeLessThanOrEqual(MAX_CHAIN_STEPS);
  });
});

describe("validateChainInput", () => {
  function input(overrides: Partial<ChainInput> = {}): ChainInput {
    return {
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [{ department: "dev", gate: "auto" }],
      enabled: true,
      ...overrides,
    };
  }

  it("accepts a valid linear/acyclic chain", () => {
    expect(validateChainInput(input())).toBeNull();
  });

  it("rejects a cycle back to the entry department", () => {
    const problem = validateChainInput(
      input({
        steps: [
          { department: "dev", gate: "auto" },
          { department: "rnd", gate: "ask" },
        ],
      }),
    );
    expect(problem).toMatch(/cycle/i);
  });

  it("rejects a cycle between two non-entry departments", () => {
    const problem = validateChainInput(
      input({
        steps: [
          { department: "dev", gate: "auto" },
          { department: "rel", gate: "auto" },
          { department: "dev", gate: "ask" },
        ],
      }),
    );
    expect(problem).toMatch(/cycle/i);
  });

  it("rejects zero steps", () => {
    expect(validateChainInput(input({ steps: [] }))).toMatch(/1–11 steps/);
  });

  it("rejects more than MAX_CHAIN_STEPS steps", () => {
    const steps = Array.from({ length: MAX_CHAIN_STEPS + 1 }, () => ({
      department: "dev" as DepartmentId,
      gate: "auto" as const,
    }));
    // avoid the cycle check firing first by using distinct-looking but actually
    // repeated departments is unavoidable past 11 (only 11 distinct ids exist);
    // the length check must win regardless of ordering.
    expect(validateChainInput(input({ steps }))).toMatch(/1–11 steps/);
  });
});

describe("chainToRules", () => {
  it("builds one rule per hop with deterministic ids and correct from/to", () => {
    const input: ChainInput = {
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [
        { department: "dev", gate: "auto" },
        { department: "rel", gate: "ask" },
      ],
      enabled: true,
    };
    const rules = chainToRules("c1", input);
    expect(rules).toEqual([
      {
        id: "c1:0",
        from: "rnd",
        signalKind: "c1",
        to: { kind: "department", id: "dev" },
        tier: 2,
        enabled: true,
        system: false,
      },
      {
        id: "c1:1",
        from: "dev",
        signalKind: "c1",
        to: { kind: "department", id: "rel" },
        tier: 3,
        enabled: true,
        system: false,
      },
    ] satisfies HandoffRule[]);
  });

  it("writes every rule's enabled in lockstep with the chain's top-level flag", () => {
    const input: ChainInput = {
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [{ department: "dev", gate: "auto" }],
      enabled: false,
    };
    const rules = chainToRules("c1", input);
    expect(rules.every((r) => r.enabled === false)).toBe(true);
  });

  it("is idempotent — the same input always produces the same rows", () => {
    const input: ChainInput = {
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [{ department: "dev", gate: "auto" }],
      enabled: true,
    };
    expect(chainToRules("c1", input)).toEqual(chainToRules("c1", input));
  });
});
