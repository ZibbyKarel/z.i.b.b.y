import { describe, expect, it } from "vitest";
import { AgentSchema } from "./agent.schema";
import { PipelineSchema } from "../pipelines/pipeline.schema";

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
  it("is optional", () => {
    expect(AgentSchema.parse(baseAgent).avatar).toBeUndefined();
  });
});
