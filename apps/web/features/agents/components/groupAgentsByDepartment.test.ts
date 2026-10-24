import type { Agent } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { groupAgentsByDepartment } from "./groupAgentsByDepartment";

const agent = (id: string, department?: string, displayName?: string): Agent => ({
  id,
  instructions: "x",
  ...(department ? { department } : {}),
  ...(displayName ? { displayName } : {}),
});

const departments = [{ id: "dev" }, { id: "qa" }, { id: "ops" }];

describe("groupAgentsByDepartment", () => {
  it("follows the department order, not the agent order", () => {
    const out = groupAgentsByDepartment([agent("a", "ops"), agent("b", "dev")], departments);
    expect(out.map((s) => s.departmentId)).toEqual(["dev", "ops"]);
  });

  it("drops departments without agents", () => {
    const out = groupAgentsByDepartment([agent("a", "qa")], departments);
    expect(out).toHaveLength(1);
    expect(out[0]?.departmentId).toBe("qa");
  });

  it("collects unknown and missing departments in a final null section", () => {
    const out = groupAgentsByDepartment(
      [agent("a", "ghost"), agent("b"), agent("c", "dev")],
      departments,
    );
    expect(out.map((s) => s.departmentId)).toEqual(["dev", null]);
    expect(out[1]?.agents.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("sorts by display name, falling back to name then id", () => {
    const out = groupAgentsByDepartment(
      [agent("z-id", "dev"), { ...agent("b", "dev"), name: "Bravo" }, agent("c", "dev", "Alpha")],
      departments,
    );
    expect(out[0]?.agents.map((a) => a.id)).toEqual(["c", "b", "z-id"]);
  });

  it("returns no sections for no agents", () => {
    expect(groupAgentsByDepartment([], departments)).toEqual([]);
  });
});
