import type { EmployeeWithState } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { EmployeeSheet, EmployeeSheetTestId } from "./EmployeeSheet";

vi.mock("../../runs", () => ({
  useRunsQuery: () => ({
    runs: [
      { runId: "r1", owner: "agent-a", status: "done", title: "Mine", startedAt: "2026-10-01" },
      { runId: "r2", owner: "agent-b", status: "done", title: "Other", startedAt: "2026-10-01" },
    ],
  }),
}));
vi.mock("../../runs/components/RunLogStream", () => ({ RunLogStream: () => null }));

const employee = {
  id: "emp-1",
  agentId: "agent-a",
  name: "Ada",
  state: "idle",
  position: { name: "coder" },
} as unknown as EmployeeWithState;

describe("EmployeeSheet", () => {
  it("links Edit to the profile and lists only the employee's own runs", () => {
    render(<EmployeeSheet employee={employee} onClose={() => {}} />);
    expect(screen.getByTestId(EmployeeSheetTestId.EditLink)).toHaveAttribute(
      "href",
      "/org/people/emp-1",
    );
    const rows = screen.getAllByTestId(EmployeeSheetTestId.TaskRow);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/activity/runs/r1");
  });
});
