import { describe, expect, it } from "vitest";
import { AgentSchema, UpdateAgentSchema } from "./agent.schema";
import { UpdateWorkflowSchema, WorkflowSchema } from "../workflows/workflow.schema";
import { AVATAR_MAX } from "../common.schema";

const baseAgent = { id: "architect", instructions: "do things" };
const baseWorkflow = {
  id: "delivery",
  instructions: "chain",
  phases: [
    {
      id: "p1",
      type: "agent",
      agent: "architect",
      model: "opus",
      thinking: "high",
      consumes: "a.md",
      produces: "b.md",
    },
  ],
};

describe("avatar field", () => {
  it("accepts a root-relative path", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "/avatars/architect.png" }).avatar).toBe(
      "/avatars/architect.png",
    );
    expect(
      WorkflowSchema.parse({ ...baseWorkflow, avatar: "/avatars/orchestrator.png" }).avatar,
    ).toBe("/avatars/orchestrator.png");
  });
  it("accepts a data URI", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "data:image/png;base64,AAAA" }).avatar).toBe(
      "data:image/png;base64,AAAA",
    );
  });
  it("rejects an arbitrary external URL", () => {
    expect(
      AgentSchema.safeParse({ ...baseAgent, avatar: "https://evil.example/x.png" }).success,
    ).toBe(false);
    expect(WorkflowSchema.safeParse({ ...baseWorkflow, avatar: "http://evil/x.png" }).success).toBe(
      false,
    );
  });
  it("rejects a protocol-relative URL", () => {
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: "//evil.example/x.png" }).success).toBe(
      false,
    );
  });
  it("rejects an avatar longer than AVATAR_MAX", () => {
    const tooLong = "data:image/png;base64," + "A".repeat(AVATAR_MAX);
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: tooLong }).success).toBe(false);
  });
  it("accepts a ~2 MB image data URI (base64 of a 2 MB file)", () => {
    // A 2 MB image → ~2.8 M base64 chars; AVATAR_MAX must admit it (TODO line 35).
    const twoMbBase64 = "data:image/png;base64," + "A".repeat(Math.ceil((2 * 1024 * 1024) / 3) * 4);
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: twoMbBase64 }).success).toBe(true);
    expect(WorkflowSchema.safeParse({ ...baseWorkflow, avatar: twoMbBase64 }).success).toBe(true);
  });
  it("is optional", () => {
    expect(AgentSchema.parse(baseAgent).avatar).toBeUndefined();
  });
});

describe("update schemas accept avatar: null as an explicit clear signal", () => {
  it("UpdateAgentSchema accepts avatar: null", () => {
    expect(UpdateAgentSchema.parse({ avatar: null }).avatar).toBeNull();
  });
  it("UpdateWorkflowSchema accepts avatar: null", () => {
    expect(UpdateWorkflowSchema.parse({ avatar: null }).avatar).toBeNull();
  });
  it("still rejects a non-null, non-string avatar", () => {
    expect(UpdateAgentSchema.safeParse({ avatar: 123 }).success).toBe(false);
  });
});
