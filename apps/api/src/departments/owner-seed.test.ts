import type { Pipeline } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { agentOwnersFromPipelines, pipelineOwnerSeed } from "./owner-seed";

function pipelineFixture(
  id: string,
  phases: Pipeline["phases"],
  ownerSubsystem?: Pipeline["ownerSubsystem"],
): Pick<Pipeline, "id" | "ownerSubsystem" | "phases"> {
  return { id, phases, ...(ownerSubsystem ? { ownerSubsystem } : {}) };
}

describe("owner-seed (NS2 F1b, pure)", () => {
  describe("pipelineOwnerSeed", () => {
    it("delivery seeds to forge", () => {
      expect(pipelineOwnerSeed("delivery")).toBe("forge");
    });

    it("every research-shaped pipeline seeds to scout", () => {
      for (const id of ["research", "product-discovery"]) {
        expect(pipelineOwnerSeed(id)).toBe("scout");
      }
    });

    // NS2 F9: content and outreach are OUTWARD VOICE (herald's mandate), not
    // research. They sat under scout only because scout was one of the three
    // seated subsystems before F9 crewed the rest of the federation.
    it("every outward-facing pipeline seeds to herald, not scout", () => {
      for (const id of ["content-piece", "content-campaign", "sales-outreach"]) {
        expect(pipelineOwnerSeed(id)).toBe("herald");
      }
    });

    // NS2 F9: F5c ("Loom v1 — scheduled quality audit") moved the stored
    // pipeline and left the seed table behind. The stored file always wins at
    // runtime, so the drift was latent rather than active — this pins it.
    it("code-audit seeds to loom (codebase quality), not scout", () => {
      expect(pipelineOwnerSeed("code-audit")).toBe("loom");
    });

    it("an unmatched pipeline id is undefined, not a guess", () => {
      // Synthetic ids on purpose (NS2 F9): this assertion must not depend on
      // which pipelines happen to exist on disk.
      expect(pipelineOwnerSeed("not-a-stored-pipeline")).toBeUndefined();
      expect(pipelineOwnerSeed("some-future-pipeline")).toBeUndefined();
    });
  });

  describe("agentOwnersFromPipelines", () => {
    it("collects every agent referenced by a delivery-role pipeline's agent phases → forge", () => {
      const pipelines = [
        pipelineFixture(
          "delivery",
          [
            { id: "architekt", type: "agent", agent: "architect" },
            { id: "koder", type: "agent", agent: "fullstack-developer" },
            { id: "review", type: "agent", agent: "code-reviewer" },
          ],
          "forge",
        ),
      ];
      const owners = agentOwnersFromPipelines(pipelines);
      expect(owners.get("architect")).toBe("forge");
      expect(owners.get("fullstack-developer")).toBe("forge");
      expect(owners.get("code-reviewer")).toBe("forge");
      expect(owners.size).toBe(3);
    });

    it("uses the seed table when a pipeline isn't yet tagged (ownerSubsystem absent)", () => {
      const pipelines = [
        pipelineFixture("delivery", [{ id: "architekt", type: "agent", agent: "architect" }]),
      ];
      expect(agentOwnersFromPipelines(pipelines).get("architect")).toBe("forge");
    });

    it("never attributes agents referenced by a non-forge pipeline", () => {
      const pipelines = [
        pipelineFixture(
          "research",
          [{ id: "scan", type: "agent", agent: "search-specialist" }],
          "scout",
        ),
      ];
      expect(agentOwnersFromPipelines(pipelines).size).toBe(0);
    });

    it("ignores verify-type phases (no agent field)", () => {
      const pipelines = [pipelineFixture("delivery", [{ id: "check", type: "verify" }], "forge")];
      expect(agentOwnersFromPipelines(pipelines).size).toBe(0);
    });

    it("codex and ledger are never assigned any entity (no rule maps to them)", () => {
      expect(pipelineOwnerSeed("codex")).toBeUndefined();
      expect(pipelineOwnerSeed("ledger")).toBeUndefined();
      const pipelines = [
        pipelineFixture("delivery", [{ id: "a", type: "agent", agent: "x" }], "forge"),
      ];
      const owners = agentOwnersFromPipelines(pipelines);
      expect([...owners.values()]).not.toContain("codex");
      expect([...owners.values()]).not.toContain("ledger");
    });
  });
});
