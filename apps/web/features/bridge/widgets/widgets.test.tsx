import type { InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import {
  BoardRowTestId,
  ButtonGroupTestId,
  IconBadgeTestId,
  IconTestId,
  IndentRailTestId,
  KpiStripTestId,
  ProgressTestId,
  RowGroupHeaderTestId,
} from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { BriefingWidget } from "./BriefingWidget";
import { IssuesWidget, IssuesWidgetTestId } from "./IssuesWidget";
import { PrsWidget, PrsWidgetTestId } from "./PrsWidget";
import type { BridgeWidgetProps } from "./registry";
import { RunsWidget, RunsWidgetTestId } from "./RunsWidget";
import { TasksWidget } from "./TasksWidget";

const refreshMutate = vi.hoisted(() => vi.fn());
vi.mock("../../inbox/mutations", () => ({
  useRefreshInboxMutation: () => ({ mutate: refreshMutate, isPending: false }),
}));

const d = vi.hoisted(() => ({
  items: [] as unknown[],
  epics: [] as unknown[],
  prs: [] as unknown[],
  tasks: [] as unknown[],
  runs: [] as unknown[],
  workflows: [] as unknown[],
  archived: [] as unknown[],
  archivedPending: false,
  approvals: [] as unknown[],
  teams: [] as unknown[],
  companies: [] as unknown[],
  pending: false,
}));

vi.mock("../../teams/queries", () => ({ useTeamsQuery: () => ({ data: d.teams }) }));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: d.companies }) }));

vi.mock("../../inbox/queries", () => ({
  useInboxItemsQuery: () => ({
    data: { items: d.items, epics: d.epics, errors: [], syncProjectIds: [] },
    isPending: d.pending,
  }),
  useInboxPrsQuery: () => ({ data: { prs: d.prs, errors: [] }, isPending: d.pending }),
}));
vi.mock("../../tasks/queries", () => ({
  useTaskParentsInfiniteQuery: () => ({ data: d.tasks, isPending: d.pending }),
}));
vi.mock("../../runs/components/TasksDockPanel", () => ({
  useLiveRuns: () => d.runs,
  useInvalidateOnTerminalRun: () => undefined,
}));
vi.mock("../../workflows", () => ({ useWorkflowsQuery: () => ({ data: d.workflows }) }));
vi.mock("../../runs/queries/useRecentArchivedRunsQuery", () => ({
  useRecentArchivedRunsQuery: () => ({ data: d.archived, isPending: d.archivedPending }),
}));
vi.mock("../../briefing/queries", () => ({
  useBriefingQuery: () => ({
    data: { headline: "Two PRs wait on you.", generatedAt: "2026-10-21T08:00:00.000Z" },
  }),
}));
vi.mock("../../approvals/queries", () => ({ useApprovalsQuery: () => ({ data: d.approvals }) }));
vi.mock("../../projects/queries", () => ({
  useBudgetQuery: () => ({
    data: { projects: [{ dailyCost: { spentUsd: 1.5 } }, { dailyCost: { spentUsd: 0.25 } }] },
  }),
}));
vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({
    code: (id: string) => id.toUpperCase(),
    name: (id: string) => id,
  }),
}));

const widget = (id: string, type: BridgeWidget["type"]): BridgeWidget => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 4,
  h: 8,
});
const setup = (over: Partial<BridgeWidgetProps> & { widget: BridgeWidget }) => {
  const props: BridgeWidgetProps = {
    adding: false,
    onEmptyChange: vi.fn(),
    onCountChange: vi.fn(),
    selection: null,
    onOpen: vi.fn(),
    epicClosed: {},
    onEpicToggle: vi.fn(),
    ...over,
  };
  return props;
};

const item = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    projectId: "p1",
    level: "task",
    name: `Item ${id}`,
    description: "",
    source: { kind: "jira", externalKey: `ZB-${id}` },
    lifecycle: "todo",
    runs: [],
    dependsOn: [],
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    project: { id: "p1", name: "Shop" },
    hidden: false,
    ...over,
  }) as unknown as InboxRoadmapItem;

const pr = (number: number, over: Partial<InboxPr> = {}): InboxPr => ({
  source: "github",
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  repo: "o/orders",
  author: "karel",
  createdAt: new Date(Date.now() - 7200_000).toISOString(),
  draft: false,
  ci: "passing",
  review: "none",
  mergeable: true,
  bucket: "mine",
  blocker: "awaiting-review",
  section: "waiting",
  projectId: "p1",
  ...over,
});

beforeEach(() => {
  refreshMutate.mockClear();
  Object.assign(d, {
    items: [],
    epics: [],
    prs: [],
    tasks: [],
    runs: [],
    workflows: [],
    archived: [],
    archivedPending: false,
    approvals: [],
    teams: [],
    companies: [],
    pending: false,
  });
  window.localStorage.clear();
});

describe("IssuesWidget", () => {
  it("issue rows show the integration icon instead of the source chip", () => {
    d.items = [item("a")];
    renderWithProviders(<IssuesWidget {...setup({ widget: widget("w", "issues") })} />);
    expect(screen.getByTestId(IssuesWidgetTestId.Source)).toHaveAccessibleName("Jira");
    expect(screen.getByTestId(IssuesWidgetTestId.Source)).toHaveStyle({ width: "34px" });
    expect(screen.queryByText("Jira")).toBeNull();
  });

  it("new/running rows show the source status instead of the ZIBBY tag", () => {
    d.items = [
      item("a", { sourceStatus: { name: "To Do", done: false } }),
      item("b", { lifecycle: "running", sourceStatus: { name: "In Progress", done: false } }),
      item("c"),
    ];
    renderWithProviders(<IssuesWidget {...setup({ widget: widget("w", "issues") })} />);
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Nové ve zdroji")).toBeNull();
    expect(screen.queryByText("Běží")).toBeNull();
  });

  it("the issue id sits on the title line", () => {
    d.items = [item("a")];
    renderWithProviders(<IssuesWidget {...setup({ widget: widget("w", "issues") })} />);
    const line = screen.getByText("ZB-a").closest("[data-testid='board-row-line']");
    expect(line).toHaveTextContent("Item a");
  });

  it("lists issues under their epic with data-rk, opens on click, folds the epic", async () => {
    d.items = [
      item("a", { parentId: "e1", lifecycle: "failed" }),
      item("b", { parentId: "e1" }),
      item("done", { lifecycle: "done" }),
    ];
    d.epics = [
      {
        id: "e1",
        projectId: "p1",
        key: "EP-1",
        title: "Checkout",
        source: "jira",
        done: 1,
        total: 4,
      },
    ];
    const props = setup({ widget: widget("w-issues", "issues") });
    const { rerender } = renderWithProviders(<IssuesWidget {...props} />);

    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(2); // done hidden
    expect(rows[0]).toHaveAttribute("data-rk", "w-issues:p1/a"); // waiting first
    expect(rows[0]).toHaveTextContent("ZB-a");
    expect(rows[0]).toHaveTextContent("Ty · 1h");
    expect(screen.getByTestId(RowGroupHeaderTestId.Title)).toHaveTextContent("Checkout");

    await userEvent.click(rows[0] as HTMLElement);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "issue",
      id: "p1/a",
      widgetId: "w-issues",
      key: "w-issues:p1/a",
      href: "/dashboard/inbox/issues/p1/a",
    });

    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 2, you: 1, aside: undefined, loading: false }),
    );

    await userEvent.click(screen.getByTestId(RowGroupHeaderTestId.Root));
    expect(props.onEpicToggle).toHaveBeenCalledWith("e1", true);
    rerender(<IssuesWidget {...props} epicClosed={{ e1: true }} />);
    expect(screen.queryAllByTestId(BoardRowTestId.Root)).toHaveLength(0);
  });

  it("marks the selected row and reports empty only once loaded", () => {
    d.items = [item("a")];
    const props = setup({
      widget: widget("w", "issues"),
      selection: { kind: "issue", id: "p1/a", widgetId: "w", key: "w:p1/a" },
    });
    const { unmount } = renderWithProviders(<IssuesWidget {...props} />);
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveAttribute("aria-pressed", "true");
    unmount();

    const left = setup({
      widget: widget("w", "issues"),
      selection: { kind: "issue", id: "p1/a", widgetId: "w", key: "w:p1/a" },
      sheetSide: "left",
    });
    const leftView = renderWithProviders(<IssuesWidget {...left} />);
    expect(screen.getByTestId(BoardRowTestId.Root).className).toContain(
      "inset_-1px_0_0_var(--color-ink)",
    );
    leftView.unmount();

    d.items = [];
    d.pending = true;
    const loading = setup({ widget: widget("w", "issues") });
    const second = renderWithProviders(<IssuesWidget {...loading} />);
    expect(loading.onEmptyChange).toHaveBeenLastCalledWith(false);
    second.unmount();

    d.pending = false;
    const loaded = setup({ widget: widget("w", "issues") });
    renderWithProviders(<IssuesWidget {...loaded} />);
    expect(loaded.onEmptyChange).toHaveBeenLastCalledWith(true);
  });

  it("narrows by the default company/team filters, keeps the header count whole", () => {
    d.items = [
      item("1", { companyId: "shoptet", teamId: "devrel" }),
      item("2", { companyId: "shoptet", teamId: "frontend" }),
      item("3", { companyId: "acme" }),
    ];
    d.teams = [{ id: "devrel", name: "DevRel", companyId: "shoptet" }];
    d.companies = [{ id: "shoptet", name: "Shoptet" }];
    const props = setup({
      widget: { ...widget("w", "issues"), filters: { companies: ["shoptet"], teams: ["devrel"] } },
      filtersOpen: true,
    });
    renderWithProviders(<IssuesWidget {...props} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(1);
    expect(screen.getByLabelText("Firmy")).toBeInTheDocument();
    expect(screen.getByLabelText("Týmy")).toBeInTheDocument();
    // The saved defaults are not "applied" filters: the header keeps the plain icon.
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 3, filtersActive: false }),
    );
  });
});

describe("header sync button", () => {
  it.each([
    ["Issues", "issues", IssuesWidget],
    ["Prs", "prs", PrsWidget],
  ] as const)("%s widget reports a refresh action that triggers a sync", (_n, type, Widget) => {
    const props = setup({ widget: widget("w", type) });
    renderWithProviders(<Widget {...props} />);
    const info = vi.mocked(props.onCountChange!).mock.lastCall![0];
    expect(info.refreshing).toBe(false);
    info.onRefresh!();
    expect(refreshMutate).toHaveBeenCalledOnce();
  });
});

describe("PrsWidget", () => {
  it("renders one flat list, stacks nested behind the rail, icons named by their meaning; opens by url", async () => {
    d.prs = [
      pr(1, { headRef: "a", baseRef: "main" }),
      pr(2, { headRef: "b", baseRef: "a", ci: "failing", blocker: "ci-failing" }),
      pr(3, { bucket: "to-review", author: "jana", authorName: "Jana Nová" }),
    ];
    const props = setup({ widget: widget("w-prs", "prs") });
    renderWithProviders(<PrsWidget {...props} />);

    expect(screen.queryAllByTestId(RowGroupHeaderTestId.Root)).toHaveLength(0); // no sections
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(3);
    const kid = screen.getByText("PR 2").closest("button") as HTMLElement;
    expect(screen.getByTestId(IndentRailTestId.Root)).toContainElement(kid);
    expect(within(kid).getByTestId(PrsWidgetTestId.Ci)).toHaveAccessibleName("CI selhává");
    expect(within(kid).getByTestId(PrsWidgetTestId.Review)).toHaveAccessibleName(
      "Čeká na review kolegů",
    );
    const theirs = screen.getByText("PR 3").closest("button") as HTMLElement;
    expect(theirs).toHaveAttribute("data-rk", "w-prs:https://github.com/o/r/pull/3");
    expect(theirs).toHaveTextContent("Jana Nová");
    expect(theirs).toHaveTextContent("orders");
    expect(within(theirs).getByTestId(PrsWidgetTestId.Avatar)).toHaveAccessibleName("Jana Nová");
    expect(within(theirs).getByTestId(PrsWidgetTestId.Avatar)).toHaveStyle({ width: "34px" });
    // Title owns the whole first line (one line, ellipsis); the age sits with the status icons.
    const lines = within(theirs).getAllByTestId(BoardRowTestId.Line);
    const iconLine = lines.find((l) => within(l).queryByTestId(PrsWidgetTestId.Ci));
    const title = within(theirs).getByText("PR 3");
    expect(title.className).toContain("truncate");
    expect(title).toHaveAttribute("title", "PR 3");
    const age = iconLine?.firstElementChild?.textContent ?? "";
    expect(age).toMatch(/2/); // createdAt is 2 h ago
    expect(lines.find((l) => l.contains(title))?.textContent).not.toContain(age);
    for (const row of rows) {
      expect(row.className).toContain("border-l-[length:var(--bridge-bar)]");
      expect(row.className).not.toContain("inset_0_0_0_1px");
    }
    expect(within(theirs).getByTestId(PrsWidgetTestId.Review)).toHaveAccessibleName(
      "Čeká na tvoje review",
    );
    expect(within(theirs).queryAllByRole("button")).toHaveLength(0); // no action buttons

    await userEvent.click(kid);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "pr",
      id: "https://github.com/o/r/pull/2",
      widgetId: "w-prs",
      key: "w-prs:https://github.com/o/r/pull/2",
    });
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 3, you: 1 }),
    );
  });

  it("own PR with unresolved threads shows the conversations badge, none at 0", () => {
    d.prs = [pr(1, { unresolvedThreads: 2 }), pr(2, { unresolvedThreads: 0 })];
    const props = setup({ widget: widget("w", "prs") });
    renderWithProviders(<PrsWidget {...props} />);
    const badge = screen.getByTestId(IconBadgeTestId.Root);
    expect(badge).toHaveAccessibleName("2 nevyřešené konverzace");
    expect(screen.getByTestId(IconBadgeTestId.Count)).toHaveTextContent("2");
    expect(screen.getByText("PR 1").closest("button")).toContainElement(badge);
    expect(screen.getAllByTestId(IconBadgeTestId.Root)).toHaveLength(1);
  });

  it("the filter multi-selects; the picked PR keeps its stack as muted context; deselect unfilters", async () => {
    d.prs = [
      pr(1, { headRef: "a", baseRef: "main" }),
      pr(2, { headRef: "b", baseRef: "a", mergeable: false }),
      pr(3),
    ];
    const props = setup({ widget: widget("w", "prs"), filtersOpen: true });
    renderWithProviders(<PrsWidget {...props} />);
    const conflict = screen.getByTestId(`${ButtonGroupTestId.Option}-conflict`);
    expect(conflict).toHaveTextContent("Konflikt1");
    expect(screen.queryByText("Vše")).not.toBeInTheDocument();
    // review (clock) and waiting merge into one option
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-waiting`)).toHaveTextContent("Čeká3");
    expect(screen.queryByTestId(`${ButtonGroupTestId.Option}-running`)).not.toBeInTheDocument();

    await userEvent.click(conflict);
    expect(conflict).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(2);
    expect(screen.getByText("PR 1").closest("button")).toHaveClass("opacity-50");
    expect(screen.getByText("PR 2").closest("button")).not.toHaveClass("opacity-50");
    // the header still counts the whole set, so the widget never collapses under a pick
    expect(props.onCountChange).toHaveBeenLastCalledWith(expect.objectContaining({ count: 3 }));

    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`));
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(2); // OR within the group

    await userEvent.click(conflict);
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`));
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(3); // empty = unfiltered
  });

  it("starts from widget.filters and resets to them when they change", async () => {
    d.prs = [pr(1), pr(2, { bucket: "to-review", author: "jana" })];
    const props = setup({
      widget: { ...widget("w", "prs"), filters: { owner: "mine" } },
      filtersOpen: true,
    });
    const { rerender } = renderWithProviders(<PrsWidget {...props} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(1);
    const mineBtn = () => screen.getByTestId(`${ButtonGroupTestId.Option}-mine`);
    expect(mineBtn()).toHaveAttribute("aria-pressed", "true");
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ filtersActive: false }),
    );

    await userEvent.click(mineBtn());
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(2);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ filtersActive: true }),
    );

    rerender(<PrsWidget {...props} widget={{ ...props.widget, filters: { ci: ["failing"] } }} />);
    expect(mineBtn()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers configured teams only, not the review teams GitHub reports", () => {
    d.prs = [pr(1, { reviewTeam: "o/blue" })];
    const props = setup({ widget: widget("w", "prs"), filtersOpen: true });
    const first = renderWithProviders(<PrsWidget {...props} />);
    expect(screen.queryByLabelText("Týmy")).not.toBeInTheDocument();
    first.unmount();
    d.teams = [{ id: "blue", name: "Blue", slug: "o/blue" }];
    renderWithProviders(<PrsWidget {...props} />);
    expect(screen.getByLabelText("Týmy")).toBeInTheDocument();
  });

  it("narrows by the default company filter", () => {
    d.prs = [pr(1, { companyId: "a" }), pr(2, { companyId: "b" })];
    d.companies = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const props = setup({ widget: { ...widget("w", "prs"), filters: { companies: ["b"] } } });
    renderWithProviders(<PrsWidget {...props} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(1);
  });

  it("renders no filter bar until filtersOpen", () => {
    d.prs = [pr(1)];
    const props = setup({ widget: widget("w", "prs") });
    const { rerender } = renderWithProviders(<PrsWidget {...props} />);
    expect(screen.queryByTestId(`${ButtonGroupTestId.Option}-failing`)).not.toBeInTheDocument();
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ filtersActive: false }),
    );
    rerender(<PrsWidget {...props} filtersOpen />);
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`)).toBeInTheDocument();
  });

  it("is empty with no PRs", () => {
    const props = setup({ widget: widget("w", "prs") });
    renderWithProviders(<PrsWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });

  it("useWidgetReport reports loading: true while the query is pending and false after", () => {
    d.pending = true;
    const pending = setup({ widget: widget("w", "prs") });
    const first = renderWithProviders(<PrsWidget {...pending} />);
    expect(pending.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ loading: true }),
    );
    first.unmount();

    d.pending = false;
    const loaded = setup({ widget: widget("w", "prs") });
    renderWithProviders(<PrsWidget {...loaded} />);
    expect(loaded.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ loading: false }),
    );
  });
});

const run = (runId: string, status: string, over: Record<string, unknown> = {}) => ({
  runId,
  kind: "agent",
  owner: "coder",
  status,
  pct: null,
  title: `Run ${runId}`,
  prompt: "",
  project: "shop",
  startedAt: new Date(Date.now() - 600_000).toISOString(),
  logBase: "agents",
  taskId: `t-${runId}`,
  ...over,
});

describe("TasksWidget (task queue)", () => {
  it("shows only waiting runs; opens the task (scheduled: its own id); static without one", async () => {
    d.runs = [
      run("a", "running"),
      run("q", "queued"),
      run("s", "scheduled", { kind: "scheduled", taskId: undefined }),
      run("h", "held", { taskId: undefined }),
      run("w", "awaiting-approval"),
    ];
    const props = setup({ widget: widget("w-tasks", "tasks") });
    renderWithProviders(<TasksWidget {...props} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Run q");
    expect(rows[0]).toHaveTextContent("ve frontě");
    expect(rows[1]).toHaveTextContent("naplánováno");
    expect(rows[2]?.tagName).toBe("DIV");
    await userEvent.click(rows[1] as HTMLElement);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "task",
      id: "s",
      widgetId: "w-tasks",
      key: "w-tasks:s",
      href: "/work/tasks/s",
    });
    expect(props.onCountChange).toHaveBeenLastCalledWith({
      count: 3,
      you: 0,
      aside: undefined,
      loading: false,
    });
  });

  it("is empty when nothing waits", () => {
    d.runs = [run("a", "running")];
    const props = setup({ widget: widget("w", "tasks") });
    renderWithProviders(<TasksWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });
});

describe("RunsWidget", () => {
  it("renders live runs with progress, state and issue; opens the run", async () => {
    d.runs = [
      {
        runId: "r1",
        kind: "agent",
        owner: "coder",
        status: "running",
        pct: 40,
        title: "Fix checkout",
        prompt: "",
        project: "shop",
        startedAt: "",
        logBase: "agents",
        taskId: "t1",
        roadmapItemLabel: "ZB-9",
      },
    ];
    const props = setup({ widget: widget("w-runs", "runs") });
    renderWithProviders(<RunsWidget {...props} />);
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveAttribute("data-rk", "w-runs:r1");
    expect(row).toHaveTextContent("Fix checkout");
    expect(row).not.toHaveTextContent("40%");
    expect(row).toHaveTextContent("—");
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Fill),
    ).not.toHaveAttribute("style");
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Root),
    ).toHaveAccessibleName("Průběh běhu");
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Root),
    ).not.toHaveAttribute("aria-valuenow");
    expect(row).toHaveTextContent("ZB-9 ↗");
    expect(screen.queryByTestId(BoardRowTestId.ColumnHeader)).toBeNull();
    await userEvent.click(row);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "run",
      id: "r1",
      widgetId: "w-runs",
      key: "w-runs:r1",
      href: "/activity/runs/r1",
    });
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
  });

  it("a workflow run fills by completed phases", () => {
    d.workflows = [
      { id: "delivery", phases: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] },
    ];
    d.runs = [
      {
        runId: "r2",
        kind: "workflow",
        owner: "delivery",
        status: "running",
        pct: null,
        title: "Ship",
        prompt: "",
        project: "shop",
        startedAt: "",
        logBase: "workflows",
        currentStage: "b",
        stageRuns: [{ phaseId: "a", runId: "s", attempt: 1, status: "done" }],
      },
    ];
    renderWithProviders(<RunsWidget {...setup({ widget: widget("w-runs", "runs") })} />);
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveTextContent("25 % · —");
    expect(screen.getByTestId(BoardRowTestId.Root)).not.toHaveTextContent("fází");
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Root),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Fill),
    ).toHaveStyle({ width: "25%" });
  });

  it("a workflow with no known phases is indeterminate", () => {
    d.runs = [
      {
        runId: "r3",
        kind: "workflow",
        owner: "delivery",
        status: "running",
        pct: null,
        title: "Ship",
        prompt: "",
        project: "shop",
        startedAt: "",
        logBase: "workflows",
        currentStage: null,
      },
    ];
    renderWithProviders(<RunsWidget {...setup({ widget: widget("w-runs", "runs") })} />);
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(ProgressTestId.Root),
    ).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveTextContent("—");
  });

  it("a run without a task still opens its run sheet", async () => {
    d.runs = [
      {
        runId: "r9",
        kind: "workflow",
        owner: "x",
        status: "running",
        pct: null,
        title: "Orphan",
        prompt: "",
        project: "shop",
        startedAt: "",
        logBase: "workflows",
      },
    ];
    const props = setup({ widget: widget("w-runs", "runs") });
    renderWithProviders(<RunsWidget {...props} />);
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveAttribute("data-rk", "w-runs:r9");
    await userEvent.click(row);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "run",
      id: "r9",
      widgetId: "w-runs",
      key: "w-runs:r9",
      href: "/activity/runs/r9",
    });
  });

  it("splits active (no waiting) from the last finished, with state-coloured bars and headers", () => {
    d.runs = [run("a", "running", { pct: 10 }), run("q", "queued")];
    d.archived = [run("d", "done"), run("e", "error")];
    const props = setup({ widget: widget("w-runs", "runs") });
    renderWithProviders(<RunsWidget {...props} />);
    const headers = screen.getAllByTestId(RowGroupHeaderTestId.Title);
    expect(headers.map((h) => h.textContent)).toEqual(["Běží", "Ukončené"]);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows.map((r) => r.getAttribute("data-rk"))).toEqual([
      "w-runs:a",
      "w-runs:d",
      "w-runs:e",
    ]);
    const icon = (id: string) =>
      within(screen.getByTestId(`${RunsWidgetTestId.StateIcon}-w-runs:${id}`)).getByTestId(
        IconTestId.Root,
      );
    expect(icon("d")).toHaveClass("text-ok");
    expect(icon("e")).toHaveClass("text-bad");
    expect(props.onCountChange).toHaveBeenLastCalledWith({
      count: 3,
      you: 0,
      aside: undefined,
      loading: false,
    });
  });

  it("omits the header of an empty group", () => {
    d.runs = [run("a", "running")];
    const props = setup({ widget: widget("w-runs", "runs") });
    const { unmount } = renderWithProviders(<RunsWidget {...props} />);
    expect(screen.getAllByTestId(RowGroupHeaderTestId.Title).map((h) => h.textContent)).toEqual([
      "Běží",
    ]);
    unmount();
    d.runs = [];
    d.archived = [run("d", "done")];
    renderWithProviders(<RunsWidget {...props} />);
    expect(screen.getAllByTestId(RowGroupHeaderTestId.Title).map((h) => h.textContent)).toEqual([
      "Ukončené",
    ]);
  });

  it("the queue and the running widget never show the same run", () => {
    d.runs = [run("a", "running"), run("p", "pending"), run("q", "queued"), run("s", "scheduled")];
    const keys = (ui: React.ReactElement) => {
      const view = renderWithProviders(ui);
      const k = screen.getAllByTestId(BoardRowTestId.Root).map((r) => r.getAttribute("data-rk"));
      view.unmount();
      return k.map((x) => x?.split(":")[1]);
    };
    const queue = keys(<TasksWidget {...setup({ widget: widget("w", "tasks") })} />);
    const active = keys(<RunsWidget {...setup({ widget: widget("w", "runs") })} />);
    expect(queue.filter((k) => active.includes(k))).toEqual([]);
    expect([...queue, ...active].sort()).toEqual(["a", "p", "q", "s"]);
  });

  it("is empty with no live runs", () => {
    const props = setup({ widget: widget("w", "runs") });
    renderWithProviders(<RunsWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });
});

describe("BriefingWidget", () => {
  it("shows the lead and the KPIs, never empty", () => {
    d.approvals = [{}, {}, {}];
    d.runs = [{}];
    d.prs = [pr(1), pr(2)];
    const props = setup({ widget: widget("w-brief", "briefing") });
    renderWithProviders(<BriefingWidget {...props} />);
    expect(screen.getByTestId(KpiStripTestId.Lead)).toHaveTextContent("Two PRs wait on you.");
    expect(screen.getByTestId(`${KpiStripTestId.Value}-needs`)).toHaveTextContent("03");
    expect(screen.getByTestId(`${KpiStripTestId.Value}-running`)).toHaveTextContent("01");
    expect(screen.getByTestId(`${KpiStripTestId.Value}-prs`)).toHaveTextContent("02");
    expect(screen.getByTestId(`${KpiStripTestId.Value}-spend`)).toHaveTextContent("$1.75");
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
  });
});
