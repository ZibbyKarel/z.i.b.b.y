import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { SegmentedControlTestId } from "@zibby/design-system";
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
    approveState: { isError: false, error: null as Error | null },
    reject: vi.fn(),
    revise: vi.fn(),
    checkpoint: null as string | null,
  },
}));

vi.mock("../queries", () => ({ useApprovalQuery: () => hooks.approval }));
vi.mock("../mutations", () => ({
  useApproveMutation: () => ({ mutate: hooks.approve, isPending: false, ...hooks.approveState }),
  useRejectMutation: () => ({ mutate: hooks.reject, isPending: false }),
  useReviseMutation: () => ({ mutate: hooks.revise, isPending: false }),
}));
vi.mock("../../tasks/queries", () => ({ useTaskQuery: () => hooks.task }));
vi.mock("../../runs/queries/useTaskRunQuery", () => ({
  useTaskRunQuery: () => ({ data: undefined }),
}));
vi.mock("../../runs/useCheckpointArtifact", () => ({
  useCheckpointArtifact: () => hooks.checkpoint,
}));

describe("ApprovalSheet (ZB-08 / D-014)", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    hooks.approve.mockClear();
    hooks.reject.mockClear();
    hooks.approval = { data: APPROVAL, isPending: false, isError: false, refetch: vi.fn() };
    hooks.task = { data: undefined };
    hooks.checkpoint = null;
    hooks.approveState = { isError: false, error: null };
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
    expect(screen.queryByRole("button", { name: "Odpovědět / připomínky" })).toBeNull();
  });

  it("shows a stage checkpoint's output so its questions can be answered in the sheet", () => {
    hooks.approval = {
      data: { ...APPROVAL, kind: "workflow-gate", action: "stage-approval" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    hooks.checkpoint = "# Questions\n\nWhich months?";
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    expect(screen.getByTestId("checkpoint-output")).toHaveTextContent("Which months?");
  });

  const PR_REVIEW: DashboardApproval = {
    ...APPROVAL,
    id: "appr-pr",
    kind: "pr-review",
    action: "github.pr.review",
    suggestedReviewEvent: "REQUEST_CHANGES",
  };
  const item = (event: string) => `${SegmentedControlTestId.Item}-${event}`;

  it("todo-10: a non-PR approval shows no review-type picker and approves with an empty body", async () => {
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    expect(screen.queryByTestId(SegmentedControlTestId.Root)).toBeNull();
  });

  it("todo-10: a PR-review sign-off preselects the suggestion and approves with it", async () => {
    hooks.approval = { data: PR_REVIEW, isPending: false, isError: false, refetch: vi.fn() };
    render(<ApprovalSheet approvalId="appr-pr" onClose={onClose} />);
    expect(screen.getByTestId(SegmentedControlTestId.Root)).toHaveAccessibleName("Typ review");
    expect(screen.getByTestId(item("REQUEST_CHANGES"))).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId(item("APPROVE"))).toHaveTextContent("Schválit");
    expect(screen.getByTestId(item("COMMENT"))).toHaveTextContent("Komentář");
    await userEvent.click(screen.getByRole("button", { name: "Odeslat review" }));
    expect(hooks.approve).toHaveBeenCalledWith(
      { params: { id: "appr-pr" }, body: { reviewEvent: "REQUEST_CHANGES" } },
      { onSuccess: expect.any(Function) },
    );
  });

  it("todo-10: the operator's pick overrides the suggestion", async () => {
    hooks.approval = { data: PR_REVIEW, isPending: false, isError: false, refetch: vi.fn() };
    render(<ApprovalSheet approvalId="appr-pr" onClose={onClose} />);
    await userEvent.click(screen.getByTestId(item("COMMENT")));
    expect(screen.getByTestId(item("COMMENT"))).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Odeslat review" }));
    expect(hooks.approve).toHaveBeenCalledWith(
      { params: { id: "appr-pr" }, body: { reviewEvent: "COMMENT" } },
      { onSuccess: expect.any(Function) },
    );
  });

  it("todo-10: switching to another approval drops the previous pick", async () => {
    hooks.approval = { data: PR_REVIEW, isPending: false, isError: false, refetch: vi.fn() };
    const { rerender } = render(<ApprovalSheet approvalId="appr-pr" onClose={onClose} />);
    await userEvent.click(screen.getByTestId(item("COMMENT")));
    hooks.approval = {
      data: { ...PR_REVIEW, id: "appr-pr2", suggestedReviewEvent: "APPROVE" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    rerender(<ApprovalSheet approvalId="appr-pr2" onClose={onClose} />);
    expect(screen.getByTestId(item("APPROVE"))).toHaveAttribute("aria-checked", "true");
  });

  it("todo-10: a decided PR-review approval shows no picker and no buttons", () => {
    hooks.approval = {
      data: { ...PR_REVIEW, status: "approved" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<ApprovalSheet approvalId="appr-pr" onClose={onClose} />);
    expect(screen.queryByTestId(SegmentedControlTestId.Root)).toBeNull();
    expect(screen.queryByRole("button", { name: "Odeslat review" })).toBeNull();
  });

  it("todo-10: a failed approve shows its error under the buttons", () => {
    hooks.approveState = { isError: true, error: new Error("GitHub: nope") };
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    expect(screen.getByTestId("approval-approve-error")).toHaveTextContent("GitHub: nope");
  });

  it("request changes on a stage checkpoint requires a note, then revises", async () => {
    hooks.approval = {
      data: { ...APPROVAL, kind: "workflow-gate", action: "stage-approval" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<ApprovalSheet approvalId="appr-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Odpovědět / připomínky" }));
    const confirm = screen.getByRole("button", { name: "Odeslat" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Odpověď nebo připomínky"), "přegeneruj stranu 7");
    await userEvent.click(confirm);
    expect(hooks.revise).toHaveBeenCalledWith(
      { params: { id: "appr-1" }, body: { note: "přegeneruj stranu 7" } },
      { onSuccess: expect.any(Function) },
    );
  });
});
