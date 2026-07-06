import { describe, expect, it } from "vitest";
import { AgentSchema, UpdateAgentSchema } from "./agent.schema";
import { PipelineSchema, UpdatePipelineSchema } from "../pipelines/pipeline.schema";
import { AVATAR_MAX } from "../common.schema";

const baseAgent = { id: "architect", instructions: "do things" };
const basePipeline = {
  id: "delivery",
  instructions: "chain",
  phases: [{ id: "p1", type: "agent", agent: "architect", model: "opus", thinking: "high", consumes: "a.md", produces: "b.md" }],
};

describe("avatar field", () => {
  it("accepts a root-relative path", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "/avatars/architect.png" }).avatar).toBe("/avatars/architect.png");
    expect(PipelineSchema.parse({ ...basePipeline, avatar: "/avatars/orchestrator.png" }).avatar).toBe("/avatars/orchestrator.png");
  });
  it("accepts a data URI", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "data:image/png;base64,AAAA" }).avatar).toBe("data:image/png;base64,AAAA");
  });
  it("rejects an arbitrary external URL", () => {
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: "https://evil.example/x.png" }).success).toBe(false);
    expect(PipelineSchema.safeParse({ ...basePipeline, avatar: "http://evil/x.png" }).success).toBe(false);
  });
  it("rejects a protocol-relative URL", () => {
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: "//evil.example/x.png" }).success).toBe(false);
  });
  it("rejects an avatar longer than AVATAR_MAX", () => {
    const tooLong = "data:image/png;base64," + "A".repeat(AVATAR_MAX);
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: tooLong }).success).toBe(false);
  });
  it("is optional", () => {
    expect(AgentSchema.parse(baseAgent).avatar).toBeUndefined();
  });
});

describe("update schemas accept avatar: null as an explicit clear signal", () => {
  it("UpdateAgentSchema accepts avatar: null", () => {
    expect(UpdateAgentSchema.parse({ avatar: null }).avatar).toBeNull();
  });
  it("UpdatePipelineSchema accepts avatar: null", () => {
    expect(UpdatePipelineSchema.parse({ avatar: null }).avatar).toBeNull();
  });
  it("still rejects a non-null, non-string avatar", () => {
    expect(UpdateAgentSchema.safeParse({ avatar: 123 }).success).toBe(false);
  });
});
