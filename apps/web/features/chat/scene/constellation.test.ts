import type { Agent } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { buildConstellation } from "./constellation";
import { categoryColor, resolvePipelineAccentHex } from "./tokens";

/** Minimal agent factory — only the fields the constellation reads. */
function agent(over: Partial<Agent> & Pick<Agent, "id">): Agent {
  return { name: over.id, ...over } as Agent;
}

describe("buildConstellation", () => {
  it("puts pinned agents/pipelines/chains first, in pin order", () => {
    const agents = [
      agent({ id: "koder", name: "Kodér", category: "Vývoj", avatar: "/avatars/koder.png" }),
      agent({ id: "tester", name: "Tester", category: "Kvalita", avatar: "/avatars/tester.png" }),
    ];
    const pipelines = [{ id: "delivery", name: "Delivery", avatar: "/avatars/delivery.png" }];
    const chains = [{ id: "research-then-build", name: "Research → Build" }];

    const roster = buildConstellation({
      agents,
      pipelines,
      chains,
      pins: [
        { kind: "chain", id: "research-then-build" },
        { kind: "pipeline", id: "delivery" },
        { kind: "agent", id: "tester" },
      ],
    });

    expect(roster.map((n) => n.id)).toEqual([
      "research-then-build", // pinned, in pin order
      "delivery",
      "tester",
      "koder", // then the imaged tail of the catalog
    ]);
  });

  it("shows a pinned agent even when it has no image", () => {
    const agents = [agent({ id: "koder", name: "Kodér", category: "Vývoj" })];
    const roster = buildConstellation({ agents, pins: [{ kind: "agent", id: "koder" }] });
    expect(roster.map((n) => n.id)).toEqual(["koder"]);
  });

  it("fills only with agents that carry an image when something is pinned", () => {
    const agents = [
      agent({ id: "pinned", name: "Pinned", category: "Vývoj" }),
      agent({ id: "imaged", name: "Imaged", category: "Kvalita", avatar: "/avatars/imaged.png" }),
      agent({ id: "plain", name: "Plain", category: "Výzkum" }),
    ];
    const roster = buildConstellation({ agents, pins: [{ kind: "agent", id: "pinned" }] });
    expect(roster.map((n) => n.id)).toEqual(["pinned", "imaged"]);
  });

  it("falls back to imageless agents only when nothing else would render", () => {
    const agents = [
      agent({ id: "a", name: "A", category: "Vývoj" }),
      agent({ id: "b", name: "B", category: "Kvalita" }),
    ];
    const roster = buildConstellation({ agents });
    expect(roster.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("does not duplicate a pinned agent in the fill tail", () => {
    const agents = [
      agent({ id: "koder", name: "Kodér", category: "Vývoj", avatar: "/avatars/koder.png" }),
    ];
    const roster = buildConstellation({ agents, pins: [{ kind: "agent", id: "koder" }] });
    expect(roster).toHaveLength(1);
    expect(roster[0]?.id).toBe("koder");
  });

  it("drops pins whose entity no longer exists", () => {
    const agents = [
      agent({ id: "koder", name: "Kodér", category: "Vývoj", avatar: "/avatars/koder.png" }),
    ];
    const roster = buildConstellation({
      agents,
      pins: [
        { kind: "agent", id: "ghost" },
        { kind: "pipeline", id: "gone" },
      ],
    });
    // No resolvable pins → fill by images.
    expect(roster.map((n) => n.id)).toEqual(["koder"]);
  });

  it("carries the avatar and category colour onto pinned agents", () => {
    const agents = [
      agent({ id: "koder", name: "Kodér", category: "Vývoj", avatar: "/avatars/koder.png" }),
    ];
    const [node] = buildConstellation({ agents, pins: [{ kind: "agent", id: "koder" }] });
    expect(node?.avatar).toBe("/avatars/koder.png");
    expect(node?.color).toBe(categoryColor("Vývoj"));
  });

  it("gives pinned pipelines/chains the pipeline accent colour, their kind, and no category", () => {
    const roster = buildConstellation({
      agents: [],
      pipelines: [{ id: "delivery", name: "Delivery" }],
      chains: [{ id: "chain-x", name: "Chain X" }],
      pins: [
        { kind: "pipeline", id: "delivery" },
        { kind: "chain", id: "chain-x" },
      ],
    });
    for (const node of roster) {
      expect(node.color).toBe(resolvePipelineAccentHex());
      expect(node.category).toBe("");
    }
    expect(roster.find((n) => n.id === "delivery")?.kind).toBe("pipeline");
    expect(roster.find((n) => n.id === "chain-x")?.kind).toBe("chain");
    // A chain has no image; a pipeline may but this one doesn't.
    expect(roster.find((n) => n.id === "chain-x")?.avatar).toBeUndefined();
  });

  it("marks an agent's kind as \"agent\" (the constellation's quieter mark)", () => {
    const agents = [agent({ id: "koder", name: "Kodér", category: "Vývoj" })];
    const [node] = buildConstellation({ agents, pins: [{ kind: "agent", id: "koder" }] });
    expect(node?.kind).toBe("agent");
  });

  it("dedupes same-named agents, preferring the canonical category", () => {
    const agents = [
      agent({ id: "koder-delivery", name: "Kodér", category: "Delivery", avatar: "/a.png" }),
      agent({ id: "koder", name: "Kodér", category: "Vývoj", avatar: "/b.png" }),
    ];
    const roster = buildConstellation({ agents });
    expect(roster).toHaveLength(1);
    expect(roster[0]?.id).toBe("koder");
    expect(roster[0]?.color).toBe(categoryColor("Vývoj"));
  });

  it("caps the roster at 12 nodes", () => {
    const agents = Array.from({ length: 20 }, (_, i) =>
      agent({ id: `a${i}`, name: `Agent ${i}`, category: "Vývoj", avatar: `/a${i}.png` }),
    );
    expect(buildConstellation({ agents })).toHaveLength(12);
  });
});
