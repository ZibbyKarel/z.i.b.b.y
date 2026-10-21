import type { DashboardApproval } from "../../../approvals/approval";
import { NeedsYouCardTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../../test/render";
import { ApprovalNeed } from "./ApprovalNeed";

const { approve, reject } = vi.hoisted(() => ({ approve: vi.fn(), reject: vi.fn() }));
vi.mock("../../../approvals", () => ({
  useApproveMutation: () => ({ mutate: approve, isPending: false }),
  useRejectMutation: () => ({ mutate: reject, isPending: false }),
}));

const approval = (over: Partial<DashboardApproval> = {}): DashboardApproval =>
  ({
    id: "ap-1",
    runId: "t-1",
    kind: "workflow",
    skill: "coder",
    action: "git.push",
    detail: "Push the branch?",
    text: "Push the branch?",
    risk: "med",
    status: "pending",
    requestedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    ...over,
  }) as DashboardApproval;

afterEach(() => {
  approve.mockReset();
  reject.mockReset();
});

describe("ApprovalNeed", () => {
  it("APPROVE and DENY call the approval mutations with the approval id", () => {
    renderWithProviders(<ApprovalNeed approval={approval()} />);
    expect(screen.getByTestId(NeedsYouCardTestId.Text)).toHaveTextContent("Push the branch?");
    fireEvent.click(screen.getByTestId(NeedsYouCardTestId.Approve));
    expect(approve).toHaveBeenCalledWith({ params: { id: "ap-1" }, body: {} });
    fireEvent.click(screen.getByTestId(NeedsYouCardTestId.Deny));
    expect(reject).toHaveBeenCalledWith({ params: { id: "ap-1" }, body: {} });
  });

  it("offers DENY only for a high-risk approval (hold-to-confirm lives on the task page)", () => {
    renderWithProviders(<ApprovalNeed approval={approval({ riskType: "platba" })} />);
    expect(screen.queryByTestId(NeedsYouCardTestId.Approve)).toBeNull();
    expect(screen.getByTestId(NeedsYouCardTestId.Deny)).toBeInTheDocument();
  });

  it("renders a diff preview as mono lines", () => {
    renderWithProviders(
      <ApprovalNeed
        approval={approval({
          preview: {
            kind: "diff",
            file: "a.ts",
            hunks: [
              {
                h: "@@ -1 +1 @@",
                lines: [
                  ["del", "a"],
                  ["add", "b"],
                ],
              },
            ],
          },
        })}
      />,
    );
    expect(screen.getByTestId(NeedsYouCardTestId.Diff)).toHaveTextContent("@@ -1 +1 @@-a+b");
  });
});
