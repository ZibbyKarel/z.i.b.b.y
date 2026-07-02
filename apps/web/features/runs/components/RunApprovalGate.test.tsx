import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { DashboardApproval } from "../../approvals/approval";
import { CodeBlockTestId } from "@zibby/design-system";
import { RunApprovalGate } from "./RunApprovalGate";

const approve = vi.fn();
const reject = vi.fn();
vi.mock("../../approvals/mutations", () => ({
  useApproveMutation: () => ({ mutate: approve, isPending: false }),
  useRejectMutation: () => ({ mutate: reject, isPending: false }),
}));

const approval: DashboardApproval = {
  id: "appr-1",
  runId: "writer_1",
  kind: "agent",
  skill: "Writer",
  action: "git.push",
  detail: "push to origin",
  risk: "high",
  status: "pending",
  requestedAt: "2026-06-14T10:00:00.000Z",
  summary: "Push the branch to origin",
};

describe("RunApprovalGate (30) — the gate's no rejects, it never deletes the run", () => {
  beforeEach(() => {
    approve.mockClear();
    reject.mockClear();
  });

  it("rejects the approval (the gate endpoint) on the negative button — not a run delete", async () => {
    render(<RunApprovalGate approval={approval} />);
    await userEvent.click(screen.getByRole("button", { name: "Zamítnout" }));
    expect(reject).toHaveBeenCalledWith({ params: { id: "appr-1" }, body: {} });
    expect(approve).not.toHaveBeenCalled();
  });

  it("approves the approval on the positive button", async () => {
    render(<RunApprovalGate approval={approval} />);
    await userEvent.click(screen.getByRole("button", { name: "Potvrdit" }));
    expect(approve).toHaveBeenCalledWith({ params: { id: "appr-1" }, body: {} });
    expect(reject).not.toHaveBeenCalled();
  });

  it("surfaces the skill + action being decided", () => {
    render(<RunApprovalGate approval={approval} />);
    expect(screen.getByText("Writer")).toBeInTheDocument();
    expect(screen.getByText(/git\.push/)).toBeInTheDocument();
  });

  it("keeps a single-click Confirm for a non-high-risk approval (no riskType)", () => {
    render(<RunApprovalGate approval={approval} />);
    expect(screen.getByRole("button", { name: "Potvrdit" })).toBeInTheDocument();
    expect(screen.queryByTestId("hold-button-root")).not.toBeInTheDocument();
  });

  it("gates a deletion approval behind hold-to-confirm (no single-click Confirm)", () => {
    render(<RunApprovalGate approval={{ ...approval, riskType: "mazani" }} />);
    // The deliberate guardrail replaces the plain Confirm button.
    expect(screen.getByTestId("hold-button-root")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Potvrdit" })).not.toBeInTheDocument();
    // Reject stays a single click (the safe direction).
    expect(screen.getByRole("button", { name: "Zamítnout" })).toBeInTheDocument();
  });

  it("also gates a payment approval behind hold-to-confirm", () => {
    render(<RunApprovalGate approval={{ ...approval, riskType: "platba" }} />);
    expect(screen.getByTestId("hold-button-root")).toBeInTheDocument();
  });

  it("keeps a multi-line detail's line breaks (N5b: a machine rename preview)", () => {
    render(
      <RunApprovalGate
        approval={{
          ...approval,
          action: "fs.rename",
          text: '/tmp/fotky: 2 file(s), "IMG_" → "vylet-"\nIMG_1.jpg → vylet-1.jpg\nIMG_2.jpg → vylet-2.jpg',
        }}
      />,
    );
    const block = screen.getByTestId(CodeBlockTestId.Root);
    expect(block).toHaveTextContent("IMG_1.jpg → vylet-1.jpg");
    expect(block).toHaveTextContent("IMG_2.jpg → vylet-2.jpg");
  });

  it("a one-line detail stays prose (no code block)", () => {
    render(<RunApprovalGate approval={{ ...approval, text: "push to origin" }} />);
    expect(screen.queryByTestId(CodeBlockTestId.Root)).toBeNull();
    expect(screen.getByText("push to origin")).toBeInTheDocument();
  });
});
