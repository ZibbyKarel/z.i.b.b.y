import { describe, expect, it } from "vitest";
import { type Workflow as ContractWorkflow, CreateWorkflowSchema } from "@zibby/contracts";
import { graphToPhases, phasesToGraph } from "./components/WorkflowDialog/workflow-graph";
import { duplicateWorkflowBody } from "./mutations";
import { selectWorkflows } from "./queries/useWorkflowsQuery";

/** A workflow that sets every optional workflow- and phase-level contract field. */
const full: ContractWorkflow = {
  id: "everything",
  name: "Everything",
  avatar: "/avatars/a.png",
  desc: "all fields",
  instructions: "all fields",
  outputs: [{ type: "pr", from: "c.md" }],
  department: "engineering",
  complexity: "deep",
  budget: { maxCostUsd: 5, warnAtPct: 50 },
  project: "demo",
  requires: ["web"],
  advisor: { model: "opus", thinking: "high", maxCalls: 2, from: "a" },
  phases: [
    {
      id: "a",
      type: "agent",
      agent: "writer",
      consumes: "task.md",
      produces: "a.md",
      model: "sonnet",
      thinking: "medium",
      qualify: true,
      prompt: "do it /skill",
      skill: "s1",
      engine: "opencode",
      engineModel: "anthropic/claude-sonnet-4",
      approval: "ask",
      loop: { to: "a", maxRetries: 1, escalate: false, then: "fail" },
      advisor: { maxCalls: 4 },
    },
    {
      id: "b",
      type: "agent",
      agent: "writer",
      consumes: "a.md",
      produces: "b.md",
      model: "sonnet",
      thinking: "medium",
      openaiModel: "gpt-6-luna",
      include: ["book/plan.json"],
      advisor: false,
    },
    {
      id: "c",
      type: "tool",
      consumes: "b.md",
      produces: "c.md",
      commands: ["echo hi"],
      loop: { to: "a", maxRetries: 2, escalate: true, then: "park", driftTo: "b" },
    },
    { id: "d", type: "workflow", workflow: "child", consumes: "c.md", produces: "d.md" },
  ],
};

describe("workflow field round-trip", () => {
  const [domain] = selectWorkflows({ body: [full] });

  it("load keeps every contract field", () => {
    expect(domain).toMatchObject({ ...full, name: "Everything" });
  });

  it("load -> graph -> save leaves phases unchanged", () => {
    const graph = phasesToGraph(domain, []);
    expect(graphToPhases(graph, "task.md")).toEqual(full.phases);
  });

  it("duplicate carries every field unchanged", () => {
    const body = duplicateWorkflowBody(domain!, []);
    expect(body).toEqual({
      ...full,
      id: "everything-copy",
      name: "Everything (copy)",
      instructions: "all fields",
    });
    const parsed = CreateWorkflowSchema.safeParse(body);
    expect(parsed.success ? "ok" : JSON.stringify(parsed.error.issues)).toBe("ok");
  });
});
