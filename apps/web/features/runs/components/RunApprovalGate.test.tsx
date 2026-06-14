import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { DashboardApproval } from "../../approvals/approval";
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
});
