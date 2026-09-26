import { DataTableTestId } from "@zibby/design-system";
import type { RunView } from "../../runs/run";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ActivityRunsScreen } from "./ActivityRunsScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    items: [] as RunView[],
    itemsPending: false,
    itemsError: false,
    counts: {} as Record<string, number>,
    total: 0,
    countsPending: false,
    countsError: false,
  },
}));
const fetchNextPage = vi.fn();
const refetchItems = vi.fn();
const refetchCounts = vi.fn();

vi.mock("../queries", () => ({
  useArchiveRunsInfiniteQuery: () => ({
    data: hooks.items,
    isPending: hooks.itemsPending,
    isError: hooks.itemsError,
    refetch: refetchItems,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useArchiveCountsQuery: () => ({
    data: { total: hooks.total, counts: hooks.counts },
    isPending: hooks.countsPending,
    isError: hooks.countsError,
    refetch: refetchCounts,
  }),
}));
vi.mock("../../departments/useOwnerDepartment", () => ({
  useOwnerDepartmentMaps: () => ({ pipelineDepartment: new Map() }),
  runDepartmentId: () => undefined,
}));

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "agent",
    owner: "coder",
    status: "done",
    title: "Ship the release",
    prompt: "Ship the release",
    startedAt: "2020-01-01T08:00:00.000Z",
    ...overrides,
  } as RunView;
}

describe("ActivityRunsScreen (ZB-07)", () => {
  beforeEach(() => {
    hooks.items = [];
    hooks.itemsPending = false;
    hooks.itemsError = false;
    hooks.total = 0;
    hooks.counts = {};
    push.mockClear();
    fetchNextPage.mockClear();
  });

  it("renders the archived runs table", () => {
    hooks.items = [run()];
    hooks.total = 1;
    render(<ActivityRunsScreen />);
    expect(screen.getByTestId(DataTableTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Ship the release")).toBeInTheDocument();
  });

  it("navigates to the run detail on row click", () => {
    hooks.items = [run({ runId: "r_42" })];
    hooks.total = 1;
    render(<ActivityRunsScreen />);
    fireEvent.click(screen.getByText("Ship the release"));
    expect(push).toHaveBeenCalledWith("/activity/runs/r_42");
  });

  it("filters rows by the state segmented control", () => {
    hooks.items = [
      run({ runId: "r_done", status: "done" }),
      run({ runId: "r_err", status: "error", title: "Broken run" }),
    ];
    hooks.total = 2;
    render(<ActivityRunsScreen />);
    expect(screen.getByText("Ship the release")).toBeInTheDocument();
    expect(screen.getByText("Broken run")).toBeInTheDocument();
  });
});
