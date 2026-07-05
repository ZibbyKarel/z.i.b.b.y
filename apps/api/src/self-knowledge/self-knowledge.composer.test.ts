import type { Agent, GateRule, GlobalGateRule, Pipeline } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  type SelfKnowledgeComposerInput,
  composeSelfKnowledge,
  computeDrift,
  mergeAutoBlocks,
} from "./self-knowledge.composer";

const agent: Agent = {
  id: "koder",
  name: "Kodér",
  description: "Writes the code.",
  instructions: "Be precise.",
};

const pipeline: Pipeline = {
  id: "build-app",
  name: "Build App",
  desc: "The delivery loop.",
  phases: [
    {
      id: "build",
      type: "agent",
      agent: "koder",
      model: "sonnet",
      thinking: "medium",
      consumes: "in.md",
      produces: "out.md",
    },
  ],
  outputs: [],
  instructions: "Deliver working code.",
};

const floorRule: GateRule = {
  id: "floor-git.push",
  source: "system",
  locked: true,
  match: [{ type: "action", action: "git.push", branch: "main" }],
  decision: "ask",
  resolve: { type: "human" },
};

const catalogRule: GlobalGateRule = {
  id: "gr-merge",
  name: "Merge PR",
  match: [{ type: "action", action: "merge" }],
  decision: "ask",
  resolve: { type: "human" },
};

function baseInput(overrides: Partial<SelfKnowledgeComposerInput> = {}): SelfKnowledgeComposerInput {
  return {
    agents: [agent],
    pipelines: [pipeline],
    gateRules: [catalogRule],
    policyFloor: [floorRule],
    channelKinds: ["slack", "email"],
    generatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("composeSelfKnowledge", () => {
  it("counts each section correctly", () => {
    const { sections } = composeSelfKnowledge(baseInput());
    expect(sections).toEqual({ agents: 1, pipelines: 1, gateRules: 2, channels: 2 });
  });

  it("renders every AUTO block with matching START/END markers", () => {
    const { markdown } = composeSelfKnowledge(baseInput());
    for (const key of ["META", "AGENTS", "PIPELINES", "GATES", "CHANNELS"]) {
      expect(markdown).toContain(`<!-- AUTO:${key}:START -->`);
      expect(markdown).toContain(`<!-- AUTO:${key}:END -->`);
    }
  });

  it("includes agent/pipeline/gate/channel content in their respective blocks", () => {
    const { markdown } = composeSelfKnowledge(baseInput());
    expect(markdown).toContain("koder");
    expect(markdown).toContain("build-app");
    expect(markdown).toContain("git.push");
    expect(markdown).toContain("Merge PR");
    expect(markdown).toContain("slack");
    expect(markdown).toContain("email");
  });

  it("carries the given generatedAt into the META block and the return value", () => {
    const { markdown, generatedAt } = composeSelfKnowledge(baseInput());
    expect(generatedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(markdown).toContain("2026-07-05T00:00:00.000Z");
  });

  it("defaults generatedAt to now when not given", () => {
    const before = Date.now();
    const { generatedAt } = composeSelfKnowledge({ ...baseInput(), generatedAt: undefined });
    expect(Date.parse(generatedAt)).toBeGreaterThanOrEqual(before);
  });

  it("renders empty-state copy for an empty catalog", () => {
    const { markdown } = composeSelfKnowledge(
      baseInput({ agents: [], pipelines: [], gateRules: [], policyFloor: [], channelKinds: [] }),
    );
    expect(markdown).toContain("No agents registered yet");
    expect(markdown).toContain("No pipelines registered yet");
    expect(markdown).toContain("No channel adapters registered");
  });

  it("is deterministic given the same input (sorted rendering)", () => {
    const shuffled = baseInput({
      agents: [
        { ...agent, id: "zzz-agent" },
        { ...agent, id: "aaa-agent" },
      ],
    });
    const first = composeSelfKnowledge(shuffled).markdown;
    const second = composeSelfKnowledge(shuffled).markdown;
    expect(first).toBe(second);
    expect(first.indexOf("aaa-agent")).toBeLessThan(first.indexOf("zzz-agent"));
  });
});

describe("mergeAutoBlocks", () => {
  it("preserves operator content outside AUTO blocks while replacing block content", () => {
    const generated = composeSelfKnowledge(baseInput()).markdown;
    const existing = [
      "# Self-Knowledge",
      "",
      "Operator note: don't touch the deploy pipeline without asking me first.",
      "",
      "<!-- AUTO:META:START -->",
      "_Generated: 2020-01-01T00:00:00.000Z_",
      "<!-- AUTO:META:END -->",
      "",
      "<!-- AUTO:AGENTS:START -->",
      "## Agents (0)",
      "_No agents registered yet._",
      "<!-- AUTO:AGENTS:END -->",
      "",
      "<!-- AUTO:PIPELINES:START -->",
      "## Pipelines (0)",
      "_No pipelines registered yet._",
      "<!-- AUTO:PIPELINES:END -->",
      "",
      "<!-- AUTO:GATES:START -->",
      "## Gate rules (0)",
      "<!-- AUTO:GATES:END -->",
      "",
      "<!-- AUTO:CHANNELS:START -->",
      "## Channels (0)",
      "<!-- AUTO:CHANNELS:END -->",
      "",
      "More operator prose at the very end.",
    ].join("\n");

    const merged = mergeAutoBlocks(existing, generated);

    expect(merged).toContain("Operator note: don't touch the deploy pipeline without asking me first.");
    expect(merged).toContain("More operator prose at the very end.");
    // The stale AUTO content is gone, replaced by the freshly generated content.
    expect(merged).not.toContain("No agents registered yet");
    expect(merged).toContain("koder");
    expect(merged).toContain("build-app");
  });

  it("appends a block missing from the existing note, without disturbing the rest", () => {
    const generated = composeSelfKnowledge(baseInput()).markdown;
    const existing = "# Self-Knowledge\n\nJust a hand-written note, no AUTO blocks yet.\n";

    const merged = mergeAutoBlocks(existing, generated);

    expect(merged).toContain("Just a hand-written note, no AUTO blocks yet.");
    expect(merged).toContain("<!-- AUTO:AGENTS:START -->");
    expect(merged).toContain("koder");
  });

  it("is idempotent: merging the same generated content twice is a no-op the second time", () => {
    const generated = composeSelfKnowledge(baseInput()).markdown;
    const once = mergeAutoBlocks("# Self-Knowledge\n", generated);
    const twice = mergeAutoBlocks(once, generated);
    expect(twice).toBe(once);
  });
});

describe("computeDrift", () => {
  it("is false when AUTO blocks are identical (even if META differs)", () => {
    const a = composeSelfKnowledge(baseInput({ generatedAt: "2020-01-01T00:00:00.000Z" })).markdown;
    const b = composeSelfKnowledge(baseInput({ generatedAt: "2030-01-01T00:00:00.000Z" })).markdown;
    expect(computeDrift(a, b)).toBe(false);
  });

  it("is true when the agents catalog changed", () => {
    const a = composeSelfKnowledge(baseInput()).markdown;
    const b = composeSelfKnowledge(baseInput({ agents: [] })).markdown;
    expect(computeDrift(a, b)).toBe(true);
  });

  it("is true when a gate rule catalog changed", () => {
    const a = composeSelfKnowledge(baseInput()).markdown;
    const b = composeSelfKnowledge(baseInput({ gateRules: [] })).markdown;
    expect(computeDrift(a, b)).toBe(true);
  });

  it("is true when a non-META block is entirely missing from one side", () => {
    const generated = composeSelfKnowledge(baseInput()).markdown;
    expect(computeDrift("# Self-Knowledge\nno blocks at all\n", generated)).toBe(true);
  });
});
