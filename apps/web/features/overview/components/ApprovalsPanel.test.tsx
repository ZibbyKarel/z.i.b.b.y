import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Approval } from "@zibby/contracts";
import { ButtonGroupTestId } from "@zibby/design-system";
import { ApprovalsPanel, ApprovalsPanelTestId } from "./ApprovalsPanel";

const approval = (id: string, overrides: Partial<Approval> = {}): Approval => ({
  id,
  runId: `run-${id}`,
  kind: "agent",
  skill: `Skill ${id}`,
  action: "run",
  detail: `detail ${id}`,
  risk: "medium",
  status: "pending",
  requestedAt: "2026-07-17T08:00:00.000Z",
  ...overrides,
});

let approvals: Approval[] = [];

vi.mock("../../approvals/queries", () => ({
  useApprovalsQuery: () => ({ data: approvals }),
}));
vi.mock("../../approvals/mutations", () => ({
  useApproveMutation: () => ({ mutate: vi.fn() }),
  useRejectMutation: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  approvals = [];
});

describe("ApprovalsPanel — subsystem filter (NS2 F3c)", () => {
  const mixed = () => [
    approval("a1", { ownerSubsystem: "forge" }),
    approval("a2", { ownerSubsystem: "puls", kind: "pipeline-stage" }),
    approval("a3"), // untagged (system-owned gate — no acting unit)
  ];

  it("shows no filter when no pending approval carries a subsystem tag", () => {
    approvals = [approval("a1"), approval("a2")];
    render(<ApprovalsPanel />);
    expect(screen.queryByTestId(ApprovalsPanelTestId.SubsystemFilter)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("approval-card-agent")).toHaveLength(2);
  });

  it("offers only subsystems with ≥1 pending approval and narrows on selection", async () => {
    approvals = mixed();
    render(<ApprovalsPanel />);
    expect(screen.getByTestId(ApprovalsPanelTestId.SubsystemFilter)).toBeInTheDocument();
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-forge`)).toBeInTheDocument();
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-puls`)).toBeInTheDocument();
    // Subsystems with nothing pending get no button.
    expect(screen.queryByTestId(`${ButtonGroupTestId.Option}-beacon`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-forge`));
    expect(screen.getAllByTestId(/^approval-card/)).toHaveLength(1);
    expect(screen.getByText("detail a1")).toBeInTheDocument();
  });

  it("deselecting the active subsystem shows the whole queue again (vše)", async () => {
    approvals = mixed();
    render(<ApprovalsPanel />);
    const forge = screen.getByTestId(`${ButtonGroupTestId.Option}-forge`);
    await userEvent.click(forge);
    expect(screen.getAllByTestId(/^approval-card/)).toHaveLength(1);
    await userEvent.click(forge); // toggle off — back to everything, untagged included
    expect(screen.getAllByTestId(/^approval-card/)).toHaveLength(3);
  });
});
