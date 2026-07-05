import type { Agent } from "@zibby/contracts";
import { AgentSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  type FallbackGroup,
  candidateAgentId,
  generateCandidateAgent,
  isCoveredByExistingAgent,
} from "./candidate-generator";

function group(over: Partial<FallbackGroup> = {}): FallbackGroup {
  return {
    normalizedSummary: "deploy to staging",
    samples: ['Deploy to Staging!', "deploy to STAGING", "Deploy   to staging"],
    terms: ["deploy", "staging"],
    count: 3,
    ...over,
  };
}

describe("candidateAgentId", () => {
  it("slugs the dominant terms into an auto- prefixed, id-safe string", () => {
    expect(candidateAgentId(group())).toBe("auto-deploy-staging");
  });

  it("falls back to the normalized summary when no terms matched", () => {
    expect(candidateAgentId(group({ terms: [], normalizedSummary: "fix the flaky test" }))).toBe(
      "auto-fix-the-flaky-test",
    );
  });

  it("never produces an id starting or ending with a separator, even from odd input", () => {
    const id = candidateAgentId(group({ terms: ["!!!", "???"], normalizedSummary: "x" }));
    expect(id.startsWith("auto-")).toBe(true);
    expect(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(id)).toBe(true);
  });
});

describe("generateCandidateAgent", () => {
  it("produces a Zod-valid Agent with status: proposed, tools: [read], category: Proposed", () => {
    const candidate = generateCandidateAgent(group());
    const parsed = AgentSchema.safeParse(candidate);
    expect(parsed.success).toBe(true);
    expect(candidate.status).toBe("proposed");
    expect(candidate.tools).toEqual(["read"]);
    expect(candidate.category).toBe("Proposed");
    expect(candidate.id).toBe("auto-deploy-staging");
  });

  it("folds the grouped sample summaries into the instructions body", () => {
    const candidate = generateCandidateAgent(group());
    for (const sample of group().samples) {
      expect(candidate.instructions).toContain(sample);
    }
  });

  it("is deterministic — the same group always yields the same candidate", () => {
    expect(generateCandidateAgent(group())).toEqual(generateCandidateAgent(group()));
  });
});

describe("isCoveredByExistingAgent", () => {
  const existing: Agent[] = [
    { id: "deployer", name: "Deployer", description: "Handles staging deploys", instructions: "x" },
  ];

  it("skips a group whose dominant terms already appear in an existing agent's description", () => {
    expect(isCoveredByExistingAgent(group(), existing)).toBe(true);
  });

  it("does not flag a group with no overlap", () => {
    expect(isCoveredByExistingAgent(group({ terms: ["research", "papers"] }), existing)).toBe(
      false,
    );
  });

  it("never flags coverage when the group has no terms at all", () => {
    expect(isCoveredByExistingAgent(group({ terms: [] }), existing)).toBe(false);
  });
});
