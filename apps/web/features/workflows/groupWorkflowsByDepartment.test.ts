import { describe, expect, it } from "vitest";
import type { DepartmentId } from "@zibby/contracts";
import type { Workflow } from "../../domain";
import { groupWorkflowsByDepartment } from "./groupWorkflowsByDepartment";

const wf = (id: string, name: string, department?: string): Workflow => ({
  id,
  name,
  lastRun: "—",
  lastState: "done",
  desc: "",
  file: "f",
  outputs: [],
  phases: [],
  department: department as DepartmentId | undefined,
});

const NAMES: Record<string, string> = { dev: "Vývoj", ops: "Provoz", delivery: "Delivery" };
const name = (id: DepartmentId) => NAMES[id];

describe("groupWorkflowsByDepartment", () => {
  it("groups by department, labels and members sorted (cs)", () => {
    const groups = groupWorkflowsByDepartment(
      [
        wf("b", "Beta", "dev"),
        wf("c", "Čtení", "ops"),
        wf("a", "Alfa", "dev"),
        wf("d", "D", "delivery"),
      ],
      name,
      "Bez oddělení",
    );
    expect(groups.map((g) => g.label)).toEqual(["Delivery", "Provoz", "Vývoj"]);
    expect(groups.map((g) => g.department)).toEqual(["delivery", "ops", "dev"]);
    expect(groups[2]?.workflows.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("puts workflows without a department into a last unowned group", () => {
    const groups = groupWorkflowsByDepartment(
      [wf("x", "X"), wf("a", "Alfa", "dev")],
      name,
      "Bez oddělení",
    );
    expect(groups.at(-1)).toEqual({
      department: null,
      label: "Bez oddělení",
      workflows: [wf("x", "X")],
    });
  });

  it("puts a department unknown to the lookup into the unowned group", () => {
    const groups = groupWorkflowsByDepartment(
      [wf("g", "Ghost", "removed"), wf("a", "Alfa", "dev")],
      name,
      "Bez oddělení",
    );
    expect(groups.map((g) => g.department)).toEqual(["dev", null]);
    expect(groups[1]?.workflows.map((w) => w.id)).toEqual(["g"]);
  });

  it("omits the unowned group when every workflow has a known department", () => {
    const groups = groupWorkflowsByDepartment([wf("a", "Alfa", "dev")], name, "Bez oddělení");
    expect(groups.map((g) => g.department)).toEqual(["dev"]);
  });

  it("returns [] for empty input", () => {
    expect(groupWorkflowsByDepartment([], name, "Bez oddělení")).toEqual([]);
  });
});
