import { HoldButtonTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../../approvals/approval";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutApprovalRow, FlyoutApprovalRowTestId } from "./FlyoutApprovalRow";

const approveMutate = vi.fn();
const rejectMutate = vi.fn();
vi.mock("../../approvals", () => ({
  useApproveMutation: () => ({ mutate: approveMutate, isPending: false }),
  useRejectMutation: () => ({ mutate: rejectMutate, isPending: false }),
}));

function approval(overrides: Partial<DashboardApproval> = {}): DashboardApproval {
  return {
    id: "app_1",
    runId: "run_1",
    kind: "agent",
    skill: "Herald",
    action: "send the weekly digest",
    detail: "3 recipients",
    risk: "medium",
    status: "pending",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FlyoutApprovalRow", () => {
  beforeEach(() => {
    approveMutate.mockClear();
    rejectMutate.mockClear();
  });

  it("GATE-BUG guard: reject calls the reject mutation directly with the exact shape", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval()} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Reject));
    expect(rejectMutate).toHaveBeenCalledWith({ params: { id: "app_1" }, body: {} });
    expect(approveMutate).not.toHaveBeenCalled();
  });

  it("approves a non-high-risk approval with one click", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval({ riskType: "odeslani" })} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Approve));
    expect(approveMutate).toHaveBeenCalledWith({ params: { id: "app_1" }, body: {} });
  });

  it("hold-gates approve (never reject) for high-risk types", () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval({ riskType: "platba" })} />);
    // HoldButton does NOT forward data-testid — select its own root testid.
    expect(screen.getByTestId(HoldButtonTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(FlyoutApprovalRowTestId.Approve)).toBeNull();
    expect(screen.getByTestId(FlyoutApprovalRowTestId.Reject)).toBeInTheDocument();
  });

  it("replaces the controls with a terminal state after deciding", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval()} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Reject));
    expect(screen.queryByTestId(FlyoutApprovalRowTestId.Reject)).toBeNull();
  });

  describe("sourceUrl (Phase 127)", () => {
    it("renders a link to the item's origin when sourceUrl is present", () => {
      renderWithProviders(
        <FlyoutApprovalRow
          approval={approval({ sourceUrl: "https://github.com/acme/repo/issues/42" })}
        />,
      );
      const link = screen.getByTestId(FlyoutApprovalRowTestId.Source);
      expect(link).toHaveAttribute("href", "https://github.com/acme/repo/issues/42");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("omits the link when sourceUrl is absent", () => {
      renderWithProviders(<FlyoutApprovalRow approval={approval()} />);
      expect(screen.queryByTestId(FlyoutApprovalRowTestId.Source)).toBeNull();
    });
  });
});
