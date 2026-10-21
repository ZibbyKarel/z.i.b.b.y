import type { InboxPr, InboxRoadmapItem, TaskParent } from "@zibby/contracts";
import { BoardRowTestId, KpiStripTestId, RowGroupHeaderTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { BriefingWidget } from "./BriefingWidget";
import { IssuesWidget } from "./IssuesWidget";
import { PrsWidget } from "./PrsWidget";
import type { BridgeWidgetProps } from "./registry";
import { RunsWidget } from "./RunsWidget";
import { TasksWidget } from "./TasksWidget";

const d = vi.hoisted(() => ({
  items: [] as unknown[],
  epics: [] as unknown[],
  prs: [] as unknown[],
  tasks: [] as unknown[],
  runs: [] as unknown[],
  approvals: [] as unknown[],
  pending: false,
}));

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
vi.mock("../../runs/components/TasksDockPanel", () => ({ useLiveRuns: () => d.runs }));
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
    editing: false,
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
  Object.assign(d, {
    items: [],
    epics: [],
    prs: [],
    tasks: [],
    runs: [],
    approvals: [],
    pending: false,
  });
  window.localStorage.clear();
});

describe("IssuesWidget", () => {
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
    expect(rows[0]).toHaveTextContent("TY · 1H");
    expect(screen.getByTestId(RowGroupHeaderTestId.Title)).toHaveTextContent("Checkout");

    await userEvent.click(rows[0] as HTMLElement);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "issue",
      id: "p1/a",
      widgetId: "w-issues",
      key: "w-issues:p1/a",
    });

    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
    expect(props.onCountChange).toHaveBeenLastCalledWith({ count: 2, you: 1, aside: undefined });

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
});

describe("PrsWidget", () => {
  it("renders stacks (kids behind the rail), status, ON / WAITS ON and opens by url", async () => {
    d.prs = [
      pr(1, { headRef: "a", baseRef: "main" }),
      pr(2, { headRef: "b", baseRef: "a", ci: "failing", blocker: "ci-failing" }),
      pr(3, { bucket: "to-review", author: "jana" }),
    ];
    const props = setup({ widget: widget("w-prs", "prs") });
    renderWithProviders(<PrsWidget {...props} />);

    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("data-rk", "w-prs:https://github.com/o/r/pull/3"); // review request first
    expect(rows[0]).toHaveTextContent("ŽÁDOST O REVIEW");
    expect(rows[0]).toHaveTextContent("JANA");
    const kid = screen.getByText("PR 2").closest("button") as HTMLElement;
    expect(kid).toHaveTextContent("CI SELHÁVÁ");
    expect(kid).toHaveTextContent("NA #1");
    expect(kid).toHaveTextContent("ČEKÁ NA #1");
    expect(within(rows[0] as HTMLElement).queryAllByRole("button")).toHaveLength(0); // no action buttons

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

  it("is empty with no PRs", () => {
    const props = setup({ widget: widget("w", "prs") });
    renderWithProviders(<PrsWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });
});

describe("TasksWidget", () => {
  it("renders task rows with pipeline chips and a YOU tag for blocked", async () => {
    const tasks: TaskParent[] = [
      {
        id: "abcdef12",
        title: "Build it",
        text: "",
        createdAt: new Date(Date.now() - 600_000).toISOString(),
        state: "working",
        subtasks: [{ taskId: "s", department: "dev", state: "working" }],
      },
      {
        id: "zz99",
        title: "Approve it",
        text: "",
        createdAt: new Date(Date.now() - 600_000).toISOString(),
        state: "blocked",
        subtasks: [],
      },
    ];
    d.tasks = tasks;
    const props = setup({ widget: widget("w-tasks", "tasks") });
    renderWithProviders(<TasksWidget {...props} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows[0]).toHaveAttribute("data-rk", "w-tasks:abcdef12");
    expect(rows[0]).toHaveTextContent("TSK-EF12");
    expect(rows[0]).toHaveTextContent("DEV");
    expect(rows[1]).toHaveTextContent("TY");
    await userEvent.click(rows[1] as HTMLElement);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "task",
      id: "zz99",
      widgetId: "w-tasks",
      key: "w-tasks:zz99",
    });
    expect(props.onCountChange).toHaveBeenLastCalledWith({ count: 2, you: 1, aside: undefined });
  });
});

describe("RunsWidget", () => {
  it("renders live runs with progress, state and issue; opens the task", async () => {
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
    expect(row).toHaveTextContent("PRACUJE");
    expect(row).toHaveTextContent("40%");
    expect(row).toHaveTextContent("ZB-9 ↗");
    expect(screen.getByTestId(BoardRowTestId.ColumnHeader)).toHaveTextContent("ÚKOL · KROK");
    await userEvent.click(row);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "task",
      id: "t1",
      widgetId: "w-runs",
      key: "w-runs:r1",
    });
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
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
