import type { Pipeline } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { agentOwnersFromPipelines, pipelineOwnerSeed } from "./owner-seed";

function pipelineFixture(
  id: string,
  phases: Pipeline["phases"],
  department?: Pipeline["department"],
): Pick<Pipeline, "id" | "department" | "phases"> {
  return { id, phases, ...(department ? { department } : {}) };
}

describe("owner-seed (NS2 F1b, pure)", () => {
  describe("pipelineOwnerSeed", () => {
    it("delivery seeds to dev", () => {
      expect(pipelineOwnerSeed("delivery")).toBe("dev");
    });

    it("every research-shaped pipeline seeds to research", () => {
      for (const id of ["research", "product-discovery"]) {
        expect(pipelineOwnerSeed(id)).toBe("rnd");
      }
    });

    // NS2 F9: content and outreach are OUTWARD VOICE (comms's mandate), not
    // research. They sat under research only because research was one of the three
    // seated departments before F9 crewed the rest of the federation.
    it("every outward-facing pipeline seeds to comms, not research", () => {
      for (const id of ["content-piece", "content-campaign", "sales-outreach"]) {
        expect(pipelineOwnerSeed(id)).toBe("com");
      }
    });

    // NS2 F9: F5c ("Arch v1 — scheduled quality audit") moved the stored
    // pipeline and left the seed table behind. The stored file always wins at
    // runtime, so the drift was latent rather than active — this pins it.
    it("code-audit seeds to arch (codebase quality), not research", () => {
      expect(pipelineOwnerSeed("code-audit")).toBe("qa");
    });

    it("an unmatched pipeline id is undefined, not a guess", () => {
      // Synthetic ids on purpose (NS2 F9): this assertion must not depend on
      // which pipelines happen to exist on disk.
      expect(pipelineOwnerSeed("not-a-stored-pipeline")).toBeUndefined();
      expect(pipelineOwnerSeed("some-future-pipeline")).toBeUndefined();
    });
  });

  describe("agentOwnersFromPipelines", () => {
    it("collects every agent referenced by a delivery-role pipeline's agent phases → dev", () => {
      const pipelines = [
        pipelineFixture(
          "delivery",
          [
            { id: "architekt", type: "agent", agent: "architect" },
            { id: "koder", type: "agent", agent: "fullstack-developer" },
            { id: "review", type: "agent", agent: "code-reviewer" },
          ],
          "dev",
        ),
      ];
      const owners = agentOwnersFromPipelines(pipelines);
      expect(owners.get("architect")).toBe("dev");
      expect(owners.get("fullstack-developer")).toBe("dev");
      expect(owners.get("code-reviewer")).toBe("dev");
      expect(owners.size).toBe(3);
    });

    it("uses the seed table when a pipeline isn't yet tagged (department absent)", () => {
      const pipelines = [
        pipelineFixture("delivery", [{ id: "architekt", type: "agent", agent: "architect" }]),
      ];
      expect(agentOwnersFromPipelines(pipelines).get("architect")).toBe("dev");
    });

    it("never attributes agents referenced by a non-dev pipeline", () => {
      const pipelines = [
        pipelineFixture(
          "research",
          [{ id: "scan", type: "agent", agent: "search-specialist" }],
          "rnd",
        ),
      ];
      expect(agentOwnersFromPipelines(pipelines).size).toBe(0);
    });

    it("ignores verify-type phases (no agent field)", () => {
      const pipelines = [pipelineFixture("delivery", [{ id: "check", type: "verify" }], "dev")];
      expect(agentOwnersFromPipelines(pipelines).size).toBe(0);
    });

    it("knowledge and finance are never assigned any entity (no rule maps to them)", () => {
      expect(pipelineOwnerSeed("knw")).toBeUndefined();
      expect(pipelineOwnerSeed("fin")).toBeUndefined();
      const pipelines = [
        pipelineFixture("delivery", [{ id: "a", type: "agent", agent: "x" }], "dev"),
      ];
      const owners = agentOwnersFromPipelines(pipelines);
      expect([...owners.values()]).not.toContain("knw");
      expect([...owners.values()]).not.toContain("fin");
    });
  });
});
