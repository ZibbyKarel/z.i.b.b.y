import type { SubsystemWithStatus } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutApprovalRowTestId } from "./FlyoutApprovalRow";
import { FlyoutErrorRowTestId } from "./FlyoutErrorRow";
import { FlyoutWorkRowTestId } from "./FlyoutWorkRow";
import { StatusFlyoutPanel, StatusFlyoutTestId } from "./StatusFlyoutPanel";

const runsState = {
  runs: [] as RunView[],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => runsState,
  useRunGlyphMap: () => new Map(),
}));

const approvalsState = {
  data: [] as DashboardApproval[],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => approvalsState,
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const subsystemsState = { data: [] as SubsystemWithStatus[] };
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => subsystemsState,
}));

function sub(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  return {
    id: "forge",
    name: "Forge",
    tagline: "t",
    mandate: "m",
    color: "#5b8def",
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  subsystemsState.data = [];
});

function panelProps() {
  return {
    anchorRect: null,
    originRect: null,
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
    onRequestClose: vi.fn(),
  };
}

function makeRun(overrides: Partial<RunView> = {}): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "Fix login bug",
    prompt: "",
    project: "acme",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("StatusFlyoutPanel", () => {
  it("is a labelled dialog portalled to document.body", () => {
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    const root = screen.getByTestId(StatusFlyoutTestId.Root);
    expect(root).toHaveRole("dialog");
    expect(root).toHaveAttribute("aria-labelledby");
    expect(root.parentElement).toBe(document.body);
  });

  it("renders working rows for live runs only, and their count in the header", () => {
    runsState.runs = [
      makeRun({ runId: "r_1", status: "running" }),
      makeRun({ runId: "r_2", status: "pending" }),
      makeRun({ runId: "r_3", status: "done" }),
    ];
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.getAllByTestId(FlyoutWorkRowTestId.Root)).toHaveLength(2);
    expect(screen.getByTestId(StatusFlyoutTestId.Header)).toHaveTextContent("2");
    runsState.runs = [];
  });

  it("renders an empty working body without rows when nothing is live", () => {
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Root)).toBeNull();
    expect(screen.getByTestId(StatusFlyoutTestId.Body)).toBeInTheDocument();
  });

  it("switches to approval rows for the waiting section", () => {
    approvalsState.data = [
      {
        id: "app_1",
        runId: "run_1",
        kind: "agent",
        skill: "Herald",
        action: "send the digest",
        detail: "3 recipients",
        risk: "medium",
        status: "pending",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderWithProviders(<StatusFlyoutPanel section="waiting" {...panelProps()} />);
    expect(screen.getByTestId(FlyoutApprovalRowTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Root)).toBeNull();
    approvalsState.data = [];
  });

  it("shows the error state (never a fake empty) when the runs query fails", () => {
    runsState.isError = true;
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    runsState.isError = false;
  });

  it("error section lists the failed runs of subsystems in error state only", () => {
    subsystemsState.data = [
      sub({ id: "forge", name: "Forge", state: "error", errorCount: 1, errorRunIds: ["r_err"] }),
      // waiting outranks error for the headline state → not in the pill's error count
      sub({
        id: "scout",
        name: "Scout",
        state: "waiting",
        errorCount: 1,
        errorRunIds: ["r_hidden"],
      }),
    ];
    runsState.runs = [makeRun({ runId: "r_err", status: "error", title: "Broken build" })];
    renderWithProviders(<StatusFlyoutPanel {...panelProps()} section="error" />);
    const rows = screen.getAllByTestId(FlyoutErrorRowTestId.Root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Broken build");
    expect(screen.getByTestId(StatusFlyoutTestId.Header)).toHaveTextContent("Chyby");
    runsState.runs = [];
  });

  it("error section shows the empty state when no subsystem carries errorRunIds", () => {
    subsystemsState.data = [sub({ id: "forge", name: "Forge", state: "error", errorCount: 1 })];
    runsState.runs = [];
    renderWithProviders(<StatusFlyoutPanel {...panelProps()} section="error" />);
    expect(screen.queryByTestId(FlyoutErrorRowTestId.Root)).toBeNull();
    expect(screen.getByTestId(StatusFlyoutTestId.Body)).toHaveTextContent("Žádné chyby");
  });
});
