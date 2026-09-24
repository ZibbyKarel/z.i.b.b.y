import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import { CoreOverviewDialog, CoreOverviewDialogTestId } from "./CoreOverviewDialog";

vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  useDepartmentsQuery: () => ({
    data: [
      { id: "dev", name: "Dev", color: "#5b8def", state: "running" },
      { id: "sec", name: "Security", color: "#f0b429", state: "error" },
      { id: "qa", name: "Arch", color: "#3fcf8e", state: "report" },
      { id: "rnd", name: "Research", color: "#f0b429", state: "waiting" },
      { id: "vault", name: "Vault", color: "#66737f", state: "idle" },
    ],
  }),
}));

describe("CoreOverviewDialog", () => {
  it("renders the roster and per-state stat counts when open", () => {
    render(<CoreOverviewDialog open onClose={() => {}} onSelectDepartment={() => {}} />);
    expect(screen.getByTestId(CoreOverviewDialogTestId.Root)).toBeInTheDocument();
    expect(screen.getAllByTestId(CoreOverviewDialogTestId.DepartmentRow)).toHaveLength(5);
  });

  it("counts an errored department in its own stat, not folded into another state (regression)", () => {
    render(<CoreOverviewDialog open onClose={() => {}} onSelectDepartment={() => {}} />);
    const stats = screen.getAllByTestId(CoreOverviewDialogTestId.Stat);
    expect(stats).toHaveLength(5);
    // stats render in this fixed order: running, error, report, waiting, idle
    expect(stats[1]).toHaveTextContent("1");
  });

  it("selecting a department row calls onSelectDepartment and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CoreOverviewDialog open onClose={onClose} onSelectDepartment={onSelect} />);
    screen.getAllByTestId(CoreOverviewDialogTestId.DepartmentRow)[0]!.click();
    expect(onSelect).toHaveBeenCalledWith("dev");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing interactive when closed", () => {
    render(<CoreOverviewDialog onClose={() => {}} onSelectDepartment={() => {}} open={false} />);
    expect(screen.queryByTestId(CoreOverviewDialogTestId.Root)).not.toBeInTheDocument();
  });
});
