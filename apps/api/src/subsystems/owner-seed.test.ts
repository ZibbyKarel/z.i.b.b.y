import type { Pipeline } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  agentOwnersFromPipelines,
  chainOwnerSeed,
  integrationOwnerSeed,
  pipelineOwnerSeed,
} from "./owner-seed";

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

    it("every research-shaped pipeline (incl. code-audit) seeds to scout", () => {
      for (const id of [
        "research",
        "product-discovery",
        "content-campaign",
        "content-piece",
        "sales-outreach",
        "code-audit",
      ]) {
        expect(pipelineOwnerSeed(id)).toBe("scout");
      }
    });

    it("an unmatched pipeline id is undefined, not a guess", () => {
      expect(pipelineOwnerSeed("demo-pipe")).toBeUndefined();
      expect(pipelineOwnerSeed("some-future-pipeline")).toBeUndefined();
    });
  });

  describe("chainOwnerSeed", () => {
    it("every chain seeds to scout", () => {
      expect(chainOwnerSeed()).toBe("scout");
    });
  });

  describe("integrationOwnerSeed", () => {
    it("every integration kind seeds to puls (herald split deferred)", () => {
      // The function takes no kind argument by design — every kind seeds the
      // same way today (TODO(F-herald) in the module doc).
      expect(integrationOwnerSeed()).toBe("puls");
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
