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
    revise: vi.fn(),
  },
}));

vi.mock("../queries", () => ({ useApprovalQuery: () => hooks.approval }));
vi.mock("../mutations", () => ({
  useApproveMutation: () => ({ mutate: hooks.approve, isPending: false }),
  useRejectMutation: () => ({ mutate: hooks.reject, isPending: false }),
  useReviseMutation: () => ({ mutate: hooks.revise, isPending: false }),
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

  it("shows the full plain-text detail and the source with its external link", () => {
    const text =
      "Draft reply:\nThanks!\n\nIn reply to:\nA very long original message …and its tail";
    hooks.approval = {
      data: {
        ...APPROVAL,
        kind: "channel",
        runId: "gh/1",
        detail: text,
        text,
        sourceUrl: "https://github.com/o/r/issues/7",
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    expect(screen.getByText(/…and its tail/)).toBeInTheDocument();
    expect(screen.getByText("Kanál")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub issue/ })).toHaveAttribute(
      "href",
      "https://github.com/o/r/issues/7",
    );
  });

  it("opens the in-app source page without pushing the old page back", async () => {
    push.mockClear();
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít v ZIBBY" }));
    expect(push).toHaveBeenCalledWith("/activity/runs/run-1");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides request-changes on a non-checkpoint approval", async () => {
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "Připomínky" })).toBeNull();
  });

  it("request changes on a stage checkpoint requires a note, then revises", async () => {
    hooks.approval = {
      data: { ...APPROVAL, kind: "workflow-gate", action: "stage-approval" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Připomínky" }));
    const confirm = screen.getByRole("button", { name: "Vrátit k úpravě" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Co upravit"), "přegeneruj stranu 7");
    await userEvent.click(confirm);
    expect(hooks.revise).toHaveBeenCalledWith(
      { params: { id: "appr-1" }, body: { note: "přegeneruj stranu 7" } },
      { onSuccess: expect.any(Function) },
    );
  });
});
