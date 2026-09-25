import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../approval";
import { ApprovalsScreen } from "./ApprovalsScreen";

const push = vi.fn();
const pathname = "/policy/approvals";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const QUEUED: DashboardApproval = {
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

const DECIDED: DashboardApproval = {
  ...QUEUED,
  id: "appr-2",
  detail: "Push staging branch",
  text: "Push staging branch",
  status: "rejected",
  decidedAt: new Date().toISOString(),
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    queue: { data: [] as DashboardApproval[], isPending: false, isError: false, refetch: vi.fn() },
    history: { data: [] as DashboardApproval[], isPending: false },
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useApprovalsQuery: () => hooks.queue,
  useApprovalHistoryQuery: () => hooks.history,
}));
vi.mock("../mutations", () => ({
  useApproveMutation: () => ({ mutate: hooks.approve, isPending: false }),
  useRejectMutation: () => ({ mutate: hooks.reject, isPending: false }),
}));

describe("ApprovalsScreen (ZB-08)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.approve.mockClear();
    hooks.reject.mockClear();
    hooks.queue = { data: [QUEUED], isPending: false, isError: false, refetch: vi.fn() };
    hooks.history = { data: [DECIDED], isPending: false };
  });

  it("single-click approves a queued item — no hold confirmation (D-014)", async () => {
    render(<ApprovalsScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(hooks.approve).toHaveBeenCalledWith({ params: { id: "appr-1" }, body: {} });
  });

  it("opening a queue row sets the shell-level ?approval= search param", async () => {
    render(<ApprovalsScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).toHaveBeenCalledWith(`${pathname}?approval=appr-1`);
  });

  it("clicking a decided history row also opens the sheet", async () => {
    render(<ApprovalsScreen />);
    await userEvent.click(screen.getByText("Push staging branch"));
    expect(push).toHaveBeenCalledWith(`${pathname}?approval=appr-2`);
  });
});
