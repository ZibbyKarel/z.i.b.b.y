import { type WorkflowPhase, WorkflowSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { removePhase } from "./remove-phase";

const agent = (id: string, consumes: string, produces: string): WorkflowPhase => ({
  id,
  type: "agent",
  agent: "coder",
  model: "sonnet",
  thinking: "low",
  consumes,
  produces,
});

describe("removePhase", () => {
  it("drops a middle phase and rewires the next one's consumes", () => {
    const phases = [
      agent("a", "in.md", "a.md"),
      agent("b", "a.md", "b.md"),
      agent("c", "b.md", "c.md"),
    ];
    const next = removePhase(phases, "b");
    expect(next.map((p) => p.id)).toEqual(["a", "c"]);
    expect(next[1]?.consumes).toBe("a.md");
    expect(phases[2]?.consumes).toBe("b.md"); // input untouched
  });

  it("drops a loop (and its qualify gate) that targets the removed phase", () => {
    const phases = [
      agent("code", "in.md", "code.md"),
      {
        ...agent("test", "code.md", "test.md"),
        qualify: true,
        loop: { to: "code", maxRetries: 2, escalate: true, then: "fail" },
      },
    ];
    const next = removePhase(phases, "code");
    expect(next).toHaveLength(1);
    expect(next[0]?.loop).toBeUndefined();
    expect(next[0]?.qualify).toBeUndefined();
    expect(next[0]?.consumes).toBe("in.md");
  });

  it("points a then at fail and drops a driftTo that named the removed phase", () => {
    const phases = [
      agent("a", "in.md", "a.md"),
      agent("b", "a.md", "b.md"),
      {
        ...agent("c", "b.md", "c.md"),
        qualify: true,
        loop: { to: "a", maxRetries: 1, escalate: false, then: "b", driftTo: "b" },
      },
    ];
    const next = removePhase(phases, "b");
    expect(next[1]?.loop).toEqual({ to: "a", maxRetries: 1, escalate: false, then: "fail" });
    expect(WorkflowSchema.safeParse({ id: "w", instructions: "x", phases: next }).success).toBe(
      true,
    );
  });
});
