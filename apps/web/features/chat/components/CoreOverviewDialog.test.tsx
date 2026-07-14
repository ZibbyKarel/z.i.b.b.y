import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import { CoreOverviewDialog, CoreOverviewDialogTestId } from "./CoreOverviewDialog";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "forge", name: "Forge", color: "#5b8def", state: "running" },
      { id: "loom", name: "Loom", color: "#3fcf8e", state: "report" },
      { id: "scout", name: "Scout", color: "#f0b429", state: "waiting" },
      { id: "vault", name: "Vault", color: "#66737f", state: "idle" },
    ],
  }),
}));

describe("CoreOverviewDialog", () => {
  it("renders the roster and per-state stat counts when open", () => {
    render(<CoreOverviewDialog open onClose={() => {}} onSelectSubsystem={() => {}} />);
    expect(screen.getByTestId(CoreOverviewDialogTestId.Root)).toBeInTheDocument();
    expect(screen.getAllByTestId(CoreOverviewDialogTestId.SubsystemRow)).toHaveLength(4);
  });

  it("selecting a subsystem row calls onSelectSubsystem and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CoreOverviewDialog open onClose={onClose} onSelectSubsystem={onSelect} />);
    screen.getAllByTestId(CoreOverviewDialogTestId.SubsystemRow)[0]!.click();
    expect(onSelect).toHaveBeenCalledWith("forge");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing interactive when closed", () => {
    render(<CoreOverviewDialog onClose={() => {}} onSelectSubsystem={() => {}} open={false} />);
    expect(screen.queryByTestId(CoreOverviewDialogTestId.Root)).not.toBeInTheDocument();
  });
});
