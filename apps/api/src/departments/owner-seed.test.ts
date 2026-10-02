import type { Workflow } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { agentOwnersFromWorkflows, workflowOwnerSeed } from "./owner-seed";

function workflowFixture(
  id: string,
  phases: Workflow["phases"],
  department?: Workflow["department"],
): Pick<Workflow, "id" | "department" | "phases"> {
  return { id, phases, ...(department ? { department } : {}) };
}

describe("owner-seed (NS2 F1b, pure)", () => {
  describe("workflowOwnerSeed", () => {
    it("delivery seeds to dev", () => {
      expect(workflowOwnerSeed("delivery")).toBe("dev");
    });

    it("every research-shaped workflow seeds to research", () => {
      for (const id of ["research", "product-discovery"]) {
        expect(workflowOwnerSeed(id)).toBe("rnd");
      }
    });

    // NS2 F9: content and outreach are OUTWARD VOICE (comms's mandate), not
    // research. They sat under research only because research was one of the three
    // seated departments before F9 crewed the rest of the federation.
    it("every outward-facing workflow seeds to comms, not research", () => {
      for (const id of ["content-piece", "content-campaign", "sales-outreach"]) {
        expect(workflowOwnerSeed(id)).toBe("com");
      }
    });

    // NS2 F9: F5c ("Arch v1 — scheduled quality audit") moved the stored
    // workflow and left the seed table behind. The stored file always wins at
    // runtime, so the drift was latent rather than active — this pins it.
    it("code-audit seeds to arch (codebase quality), not research", () => {
      expect(workflowOwnerSeed("code-audit")).toBe("qa");
    });

    it("an unmatched workflow id is undefined, not a guess", () => {
      // Synthetic ids on purpose (NS2 F9): this assertion must not depend on
      // which workflows happen to exist on disk.
      expect(workflowOwnerSeed("not-a-stored-workflow")).toBeUndefined();
      expect(workflowOwnerSeed("some-future-workflow")).toBeUndefined();
    });
  });

  describe("agentOwnersFromWorkflows", () => {
    it("collects every agent referenced by a delivery-role workflow's agent phases → dev", () => {
      const workflows = [
        workflowFixture(
          "delivery",
          [
            { id: "architekt", type: "agent", agent: "architect" },
            { id: "koder", type: "agent", agent: "fullstack-developer" },
            { id: "review", type: "agent", agent: "code-reviewer" },
          ],
          "dev",
        ),
      ];
      const owners = agentOwnersFromWorkflows(workflows);
      expect(owners.get("architect")).toBe("dev");
      expect(owners.get("fullstack-developer")).toBe("dev");
      expect(owners.get("code-reviewer")).toBe("dev");
      expect(owners.size).toBe(3);
    });

    it("uses the seed table when a workflow isn't yet tagged (department absent)", () => {
      const workflows = [
        workflowFixture("delivery", [{ id: "architekt", type: "agent", agent: "architect" }]),
      ];
      expect(agentOwnersFromWorkflows(workflows).get("architect")).toBe("dev");
    });

    it("never attributes agents referenced by a non-dev workflow", () => {
      const workflows = [
        workflowFixture(
          "research",
          [{ id: "scan", type: "agent", agent: "search-specialist" }],
          "rnd",
        ),
      ];
      expect(agentOwnersFromWorkflows(workflows).size).toBe(0);
    });

    it("ignores verify-type phases (no agent field)", () => {
      const workflows = [workflowFixture("delivery", [{ id: "check", type: "verify" }], "dev")];
      expect(agentOwnersFromWorkflows(workflows).size).toBe(0);
    });

    it("knowledge and finance are never assigned any entity (no rule maps to them)", () => {
      expect(workflowOwnerSeed("knw")).toBeUndefined();
      expect(workflowOwnerSeed("fin")).toBeUndefined();
      const workflows = [
        workflowFixture("delivery", [{ id: "a", type: "agent", agent: "x" }], "dev"),
      ];
      const owners = agentOwnersFromWorkflows(workflows);
      expect([...owners.values()]).not.toContain("knw");
      expect([...owners.values()]).not.toContain("fin");
    });
  });
});
