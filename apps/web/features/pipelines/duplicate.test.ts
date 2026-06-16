import { describe, expect, it } from "vitest";
import { CreatePipelineSchema } from "@zibby/contracts";
import type { Pipeline } from "../../domain";
import { duplicatePipelineBody, duplicatePipelineId } from "./mutations";

const pipeline: Pipeline = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "build it",
  file: "f",
  phases: [
    {
      id: "koder",
      type: "agent",
      agent: "writer",
      consumes: "task.md",
      produces: "implementation.md",
      model: "sonnet",
      thinking: "medium",
      loop: { to: "koder", maxRetries: 1, escalate: false, then: "park" },
    },
    { id: "verify", type: "verify", commands: ["pnpm test"] },
  ],
  outputs: [{ type: "pr", from: "implementation.md" }],
};

describe("duplicatePipelineId", () => {
  it("derives <base>-copy, then numbered fallbacks on collision", () => {
    expect(duplicatePipelineId("delivery", ["delivery"])).toBe("delivery-copy");
    expect(duplicatePipelineId("delivery", ["delivery", "delivery-copy"])).toBe(
      "delivery-copy-2",
    );
    expect(
      duplicatePipelineId("delivery", ["delivery", "delivery-copy", "delivery-copy-2"]),
    ).toBe("delivery-copy-3");
  });
});

describe("duplicatePipelineBody", () => {
  it("copies the body under the new id and stays schema-valid", () => {
    const body = duplicatePipelineBody(pipeline, ["delivery"]);
    expect(body.id).toBe("delivery-copy");
    expect(body.name).toBe("Delivery (copy)");
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0]).toMatchObject({ id: "koder", agent: "writer" });
    expect(body.phases[1]).toMatchObject({ id: "verify", type: "verify" });
    // Delivery sinks carry into the copy unchanged.
    expect(body.outputs).toEqual([{ type: "pr", from: "implementation.md" }]);
    expect(CreatePipelineSchema.safeParse(body).success).toBe(true);
  });
});
