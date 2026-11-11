import { DataTableTestId, StatePillTestId } from "@zibby/design-system";
import type { RunView } from "../../runs/run";
import { fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ActivityRunsScreen } from "./ActivityRunsScreen";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/activity/runs",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "c1", name: "Acme" }] }),
}));
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "p1", name: "Portal" }] }),
}));

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
const runsQuery = vi.fn();
const refetchItems = vi.fn();
const refetchCounts = vi.fn();

vi.mock("../queries", () => ({
  useArchiveRunsInfiniteQuery: (filter: unknown) => (
    runsQuery(filter),
    {
      data: hooks.items,
      isPending: hooks.itemsPending,
      isError: hooks.itemsError,
      refetch: refetchItems,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    }
  ),
  useArchiveCountsQuery: () => ({
    data: { total: hooks.total, counts: hooks.counts },
    isPending: hooks.countsPending,
    isError: hooks.countsError,
    refetch: refetchCounts,
  }),
}));
vi.mock("../../departments/useOwnerDepartment", () => ({
  useOwnerDepartmentMaps: () => ({ workflowDepartment: new Map() }),
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
    replace.mockClear();
    search = "";
    runsQuery.mockClear();
    fetchNextPage.mockClear();
  });

  it("renders the state column as the StatePill /work/tasks uses", () => {
    hooks.items = [run({ status: "error" })];
    hooks.total = 1;
    render(<ActivityRunsScreen />);
    const pill = screen.getByTestId(StatePillTestId.Root);
    expect(within(pill).getByTestId(StatePillTestId.Label)).toHaveTextContent("Chyba");
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

  it("todo-14: sends every URL filter + sort to the server query", () => {
    search =
      "q=deploy&state=running&company=c1&project=p1&kind=workflow&department=dev&sort=cost&dir=asc";
    render(<ActivityRunsScreen />);
    expect(runsQuery).toHaveBeenLastCalledWith({
      search: "deploy",
      departments: ["dev"],
      statuses: ["running"],
      project: "p1",
      company: "c1",
      kind: "workflow",
      sort: "cost",
      dir: "asc",
    });
  });

  it("todo-14: without a state filter it asks for every status (live runs too)", () => {
    render(<ActivityRunsScreen />);
    const filter = runsQuery.mock.lastCall?.[0] as { statuses: string[] };
    expect(filter.statuses).toEqual(expect.arrayContaining(["running", "done", "queued"]));
  });

  it("todo-14: a header click writes the sort into the URL, keeping other params", () => {
    search = "state=done";
    hooks.items = [run()];
    hooks.total = 1;
    render(<ActivityRunsScreen />);
    expect(screen.getByTestId(`${DataTableTestId.HeaderCell}-started`)).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    fireEvent.click(screen.getByTestId(`${DataTableTestId.SortButton}-cost`));
    expect(replace).toHaveBeenCalledWith("/activity/runs?state=done&sort=cost&dir=desc");
  });

  it("todo-14: a state pick writes ?state= and keeps the sort", () => {
    search = "sort=title&dir=asc";
    render(<ActivityRunsScreen />);
    fireEvent.click(screen.getByText("Chyba"));
    expect(replace).toHaveBeenCalledWith("/activity/runs?sort=title&dir=asc&state=error");
  });

  it("shows the run's processor and cost", () => {
    hooks.items = [run({ costUsd: 1.5, processor: { kind: "agent", id: "c", name: "Kodér" } })];
    hooks.total = 1;
    render(<ActivityRunsScreen />);
    expect(screen.getByTestId(`${DataTableTestId.Cell}-r_1-processor`)).toHaveTextContent("Kodér");
    expect(screen.getByTestId(`${DataTableTestId.Cell}-r_1-cost`)).toHaveTextContent("$1.50");
  });
});
