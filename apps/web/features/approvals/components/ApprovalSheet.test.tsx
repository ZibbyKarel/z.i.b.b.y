import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../approval";
import { ApprovalSheet } from "./ApprovalSheet";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const APPROVAL: DashboardApproval = {
  id: "appr-1",
  runId: "run-1",
  kind: "agent",
  skill: "koder",
  action: "git.push",
  detail: "Push to main",
  text: "Push to main",
  risk: "low",
  status: "pending",
  requestedAt: new Date().toISOString(),
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    approval: {
      data: undefined as DashboardApproval | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    task: { data: undefined },
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("../queries", () => ({ useApprovalQuery: () => hooks.approval }));
vi.mock("../mutations", () => ({
  useApproveMutation: () => ({ mutate: hooks.approve, isPending: false }),
  useRejectMutation: () => ({ mutate: hooks.reject, isPending: false }),
}));
vi.mock("../../tasks/queries", () => ({ useTaskQuery: () => hooks.task }));

describe("ApprovalSheet (ZB-08 / D-014)", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    hooks.approve.mockClear();
    hooks.reject.mockClear();
    hooks.approval = { data: APPROVAL, isPending: false, isError: false, refetch: vi.fn() };
    hooks.task = { data: undefined };
  });

  it("renders nothing when no approval id is set", () => {
    render(<ApprovalSheet approvalId={null} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("approves with a single click — no HoldButton confirmation step", async () => {
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Schválit" }));
    expect(hooks.approve).toHaveBeenCalledWith(
      { params: { id: "appr-1" }, body: {} },
      { onSuccess: expect.any(Function) },
    );
  });

  it("deny reveals an optional reason field (O-12) then confirms the rejection", async () => {
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Zamítnout" }));
    const reasonField = screen.getByLabelText("Důvod (volitelné)");
    await userEvent.type(reasonField, "Not scoped for this sprint");
    await userEvent.click(screen.getByRole("button", { name: "Potvrdit zamítnutí" }));
    expect(hooks.reject).toHaveBeenCalledWith(
      { params: { id: "appr-1" }, body: { reason: "Not scoped for this sprint" } },
      { onSuccess: expect.any(Function) },
    );
  });
});
