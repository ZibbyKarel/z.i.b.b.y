import type { Agent, GateRule, GlobalGateRule, Pipeline, Subsystem } from "@zibby/contracts";
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

const subsystem: Subsystem = {
  id: "forge",
  name: "Forge",
  tagline: "Kovárna doručení",
  mandate: "Orchestrace delivery pipeline: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor.",
  color: "#f97316",
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
    subsystems: [subsystem],
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
    expect(sections).toEqual({
      agents: 1,
      pipelines: 1,
      gateRules: 2,
      channels: 2,
      subsystems: 1,
      codebaseShape: { present: false, godNodes: 0, communities: 0 },
    });
  });

  it("renders every AUTO block with matching START/END markers", () => {
    const { markdown } = composeSelfKnowledge(baseInput());
    for (const key of [
      "META",
      "AGENTS",
      "PIPELINES",
      "SUBSYSTEMS",
      "GATES",
      "CHANNELS",
      "CODEBASE-SHAPE",
    ]) {
      expect(markdown).toContain(`<!-- AUTO:${key}:START -->`);
      expect(markdown).toContain(`<!-- AUTO:${key}:END -->`);
    }
  });

  it("includes agent/pipeline/subsystem/gate/channel content in their respective blocks", () => {
    const { markdown } = composeSelfKnowledge(baseInput());
    expect(markdown).toContain("koder");
    expect(markdown).toContain("build-app");
    expect(markdown).toContain("Forge");
    expect(markdown).toContain("Orchestrace delivery pipeline");
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
      baseInput({
        agents: [],
        pipelines: [],
        subsystems: [],
        gateRules: [],
        policyFloor: [],
        channelKinds: [],
      }),
    );
    expect(markdown).toContain("No agents registered yet");
    expect(markdown).toContain("No pipelines registered yet");
    expect(markdown).toContain("No subsystems registered yet");
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

  describe("SUBSYSTEMS block", () => {
    it("renders name + mandate, sorted by id, with NO live state/counts", () => {
      const beacon: Subsystem = {
        id: "beacon",
        name: "Beacon",
        tagline: "Maják v noci",
        mandate: "Eskalace incidentů — vlastní podoba Tier-3 kontraktu surface-and-wait.",
        color: "#f59e0b",
      };
      const { markdown, sections } = composeSelfKnowledge(
        baseInput({ subsystems: [beacon, subsystem] }),
      );

      expect(markdown).toContain("## Subsystems (2)");
      expect(markdown).toContain("Forge");
      expect(markdown).toContain("Orchestrace delivery pipeline");
      expect(markdown).toContain("Beacon");
      expect(markdown).toContain("Eskalace incidentů");
      // Static identity only — no live status fields anywhere in the block.
      // (The enum-token guard for the old Czech state literals was dropped as
      // vacuous post-rename — the composer consumes `Subsystem`, which has no
      // `state` field, so the tier2Count/tier3Count assertions above already
      // enforce this structurally and behaviorally.)
      expect(markdown).not.toContain("tier2Count");
      expect(markdown).not.toContain("tier3Count");
      // Sorted by id: "beacon" before "forge".
      expect(markdown.indexOf("Beacon")).toBeLessThan(markdown.indexOf("Forge"));
      expect(sections.subsystems).toBe(2);
    });

    it("renders empty-state copy when there are no subsystems", () => {
      const { markdown, sections } = composeSelfKnowledge(baseInput({ subsystems: [] }));
      expect(markdown).toContain("No subsystems registered yet");
      expect(sections.subsystems).toBe(0);
    });
  });

  describe("CODEBASE-SHAPE block", () => {
    it("renders a missing-report hint when codebaseShape is absent", () => {
      const { markdown, sections } = composeSelfKnowledge(baseInput());
      expect(markdown).toContain("graphify-out is missing");
      expect(markdown).toContain("/graphify");
      expect(sections.codebaseShape).toEqual({ present: false, godNodes: 0, communities: 0 });
    });

    it("renders a missing-report hint when codebaseShape is explicitly null", () => {
      const { markdown } = composeSelfKnowledge(baseInput({ codebaseShape: null }));
      expect(markdown).toContain("graphify-out is missing");
    });

    it("renders a digest of god nodes and communities when codebaseShape is present", () => {
      const { markdown, sections } = composeSelfKnowledge(
        baseInput({
          codebaseShape: {
            godNodes: [
              { name: "Stack()", degree: 144 },
              { name: "Typography()", degree: 139 },
            ],
            communities: [
              { label: "LoggerService", size: 70 },
              { label: "Project", size: 6 },
            ],
          },
        }),
      );

      expect(markdown).toContain("Stack()");
      expect(markdown).toContain("144 edges");
      expect(markdown).toContain("Typography()");
      expect(markdown).toContain("LoggerService");
      expect(markdown).toContain("Project");
      expect(markdown).toContain("graphify-out/GRAPH_REPORT.md");
      expect(markdown).not.toContain("graphify-out is missing");
      expect(sections.codebaseShape).toEqual({ present: true, godNodes: 2, communities: 2 });
    });

    it("caps the digest to the top ~10 god nodes and communities by size", () => {
      const godNodes = Array.from({ length: 15 }, (_, i) => ({
        name: `node-${i}`,
        degree: 15 - i,
      }));
      const communities = Array.from({ length: 15 }, (_, i) => ({
        label: `community-${i}`,
        size: 15 - i,
      }));
      const { markdown, sections } = composeSelfKnowledge(
        baseInput({ codebaseShape: { godNodes, communities } }),
      );

      expect(markdown).toContain("node-0");
      expect(markdown).not.toContain("node-14");
      expect(markdown).toContain("community-0");
      expect(markdown).not.toContain("community-14");
      // Sections still report the true, un-truncated counts.
      expect(sections.codebaseShape).toEqual({ present: true, godNodes: 15, communities: 15 });
    });
  });
});

describe("AUTO-boundary-marker defanging (MD injection)", () => {
  const forgedName = "Evil <!-- AUTO:GATES:END --> Agent";
  const bareArrow = "Trailing --> arrow";

  /**
   * The composer's own scaffold ALWAYS emits one real, literal
   * `<!-- AUTO:GATES:END -->` marker (the true block closer) — so the
   * assertion isn't "the string never appears," it's "it appears exactly
   * once (the real one), and the entity-supplied copy renders defanged."
   */
  function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  it("defangs a forged AUTO block marker inside an agent name/description", () => {
    const { markdown } = composeSelfKnowledge(
      baseInput({
        agents: [{ ...agent, name: forgedName, description: bareArrow }],
      }),
    );
    expect(countOccurrences(markdown, "<!-- AUTO:GATES:END -->")).toBe(1);
    expect(markdown).toContain("‹!-- AUTO:GATES:END --›");
    expect(markdown).toContain("Trailing --› arrow");
  });

  it("defangs a forged AUTO block marker inside a pipeline name/desc", () => {
    const { markdown } = composeSelfKnowledge(
      baseInput({
        pipelines: [{ ...pipeline, name: forgedName, desc: bareArrow }],
      }),
    );
    expect(countOccurrences(markdown, "<!-- AUTO:GATES:END -->")).toBe(1);
    expect(markdown).toContain("‹!-- AUTO:GATES:END --›");
    expect(markdown).toContain("Trailing --› arrow");
  });

  it("defangs a forged AUTO block marker inside a subsystem name/mandate", () => {
    const { markdown } = composeSelfKnowledge(
      baseInput({
        subsystems: [{ ...subsystem, name: forgedName, mandate: bareArrow }],
      }),
    );
    expect(countOccurrences(markdown, "<!-- AUTO:GATES:END -->")).toBe(1);
    expect(markdown).toContain("‹!-- AUTO:GATES:END --›");
    expect(markdown).toContain("Trailing --› arrow");
  });

  it("defangs a forged AUTO block marker inside a catalog gate-rule name", () => {
    const { markdown } = composeSelfKnowledge(
      baseInput({
        gateRules: [{ ...catalogRule, name: forgedName }],
      }),
    );
    expect(countOccurrences(markdown, "<!-- AUTO:GATES:END -->")).toBe(1);
    expect(markdown).toContain("‹!-- AUTO:GATES:END --›");
  });

  it("defangs a forged AUTO block marker inside a channel kind string", () => {
    const { markdown } = composeSelfKnowledge(baseInput({ channelKinds: [forgedName] }));
    expect(countOccurrences(markdown, "<!-- AUTO:GATES:END -->")).toBe(1);
    expect(markdown).toContain("‹!-- AUTO:GATES:END --›");
  });

  it("mergeAutoBlocks/extractBlockContent round-trip: a forged marker in the AGENTS block does NOT corrupt the real GATES block", () => {
    // A poisoned "generated" snapshot: an agent name carrying a forged
    // AUTO:GATES:END marker. Because the escaper runs at render time, the
    // forged text is already defanged inside `generated` — this proves the
    // full pipeline (compose → merge → extract) stays correct end-to-end,
    // not just that the raw string looks defanged in isolation.
    const generated = composeSelfKnowledge(
      baseInput({
        agents: [{ ...agent, name: forgedName, description: "poisoned" }],
      }),
    ).markdown;

    const existing = [
      "# Self-Knowledge",
      "",
      "<!-- AUTO:AGENTS:START -->",
      "## Agents (0)",
      "_No agents registered yet._",
      "<!-- AUTO:AGENTS:END -->",
      "",
      "<!-- AUTO:GATES:START -->",
      "## Gate rules (0)",
      "_None._",
      "<!-- AUTO:GATES:END -->",
      "",
      "Operator prose that must survive.",
    ].join("\n");

    const merged = mergeAutoBlocks(existing, generated);

    // The forged marker text is inert — it did not prematurely close the
    // AGENTS block nor fabricate/duplicate a GATES block.
    expect(merged).not.toContain("<!-- AUTO:GATES:END -->\n\n<!-- AUTO:GATES:END -->");
    const gatesEndCount = (merged.match(/<!-- AUTO:GATES:END -->/g) ?? []).length;
    expect(gatesEndCount).toBe(1);
    const agentsEndCount = (merged.match(/<!-- AUTO:AGENTS:END -->/g) ?? []).length;
    expect(agentsEndCount).toBe(1);

    // The legitimate GATES block content is still extracted intact — mirrors
    // what `extractBlockContent`/`computeDrift` do internally (locate the
    // block by its real, un-forged marker pair).
    const gatesBlockMatch = merged.match(
      /<!-- AUTO:GATES:START -->\n?([\s\S]*?)\n?<!-- AUTO:GATES:END -->/,
    );
    expect(gatesBlockMatch).not.toBeNull();
    expect(gatesBlockMatch?.[1]).toContain("## Gate rules");

    // Operator prose outside AUTO blocks survives untouched.
    expect(merged).toContain("Operator prose that must survive.");

    // The forged marker rendered defanged, not live.
    expect(merged).toContain("‹!-- AUTO:GATES:END --›");
  });

  it("computeDrift still round-trips correctly when a poisoned generated snapshot is compared to itself", () => {
    const generated = composeSelfKnowledge(
      baseInput({
        agents: [{ ...agent, name: forgedName }],
      }),
    ).markdown;
    expect(computeDrift(generated, generated)).toBe(false);
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
      "<!-- AUTO:CODEBASE-SHAPE:START -->",
      "## Codebase shape",
      "_graphify-out is missing — run `/graphify` to generate it._",
      "<!-- AUTO:CODEBASE-SHAPE:END -->",
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

  it("preserves operator content outside blocks while replacing a stale CODEBASE-SHAPE block", () => {
    const generated = composeSelfKnowledge(
      baseInput({
        codebaseShape: {
          godNodes: [{ name: "Stack()", degree: 144 }],
          communities: [{ label: "LoggerService", size: 70 }],
        },
      }),
    ).markdown;
    const existing = [
      "# Self-Knowledge",
      "",
      "Operator note: keep this line no matter what.",
      "",
      "<!-- AUTO:CODEBASE-SHAPE:START -->",
      "## Codebase shape",
      "_graphify-out is missing — run `/graphify` to generate it._",
      "<!-- AUTO:CODEBASE-SHAPE:END -->",
    ].join("\n");

    const merged = mergeAutoBlocks(existing, generated);

    expect(merged).toContain("Operator note: keep this line no matter what.");
    expect(merged).toContain("Stack()");
    expect(merged).toContain("LoggerService");
    expect(merged).not.toContain("graphify-out is missing");
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

  it("reacts to a codebaseShape change (absent vs. present)", () => {
    const a = composeSelfKnowledge(baseInput()).markdown;
    const b = composeSelfKnowledge(
      baseInput({ codebaseShape: { godNodes: [{ name: "Stack()", degree: 144 }], communities: [] } }),
    ).markdown;
    expect(computeDrift(a, b)).toBe(true);
  });

  it("is false when codebaseShape content is identical across both sides", () => {
    const shape = { godNodes: [{ name: "Stack()", degree: 144 }], communities: [] };
    const a = composeSelfKnowledge(baseInput({ codebaseShape: shape })).markdown;
    const b = composeSelfKnowledge(baseInput({ codebaseShape: shape })).markdown;
    expect(computeDrift(a, b)).toBe(false);
  });
});
