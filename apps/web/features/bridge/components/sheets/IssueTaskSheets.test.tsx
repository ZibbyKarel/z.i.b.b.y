import {
  AnchoredSheetTestId,
  MarkdownTestId,
  NeedsYouCardTestId,
  StatCellTestId,
} from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../../test/render";
import { IssueSheet } from "./IssueSheet";
import { TaskSheet } from "./TaskSheet";

const { hooks, process, approve } = vi.hoisted(() => ({
  hooks: { items: [] as unknown[], task: undefined as unknown, approvals: [] as unknown[] },
  process: vi.fn(),
  approve: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../inbox/queries", () => ({
  useInboxItemsQuery: () => ({ data: { items: hooks.items, epics: [] } }),
}));
vi.mock("../../../inbox/useInboxItemActions", () => ({
  useInboxItemActions: () => ({ process, isProcessing: () => false, toggleHidden: vi.fn() }),
}));
vi.mock("../../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../../tasks", () => ({ useTaskQuery: () => ({ data: hooks.task }) }));
vi.mock("../../../approvals", () => ({
  useApprovalsQuery: () => ({ data: hooks.approvals }),
  useApproveMutation: () => ({ mutate: approve, isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const anchor = {
  side: "r",
  left: 400,
  width: 800,
  top: 0,
  height: 700,
  eL: -2,
  eT: 40,
  eH: 30,
} as const;

const item = (lifecycle: string) => ({
  id: "i1",
  projectId: "p",
  name: "Fix login",
  description: "Line one\n\nLine **two** <b>raw</b>",
  lifecycle,
  source: { kind: "jira", externalKey: "ZB-1", url: "https://jira.test/ZB-1" },
  project: { id: "p", name: "Shop" },
  runs: [],
  hidden: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

afterEach(() => {
  hooks.items = [];
  hooks.approvals = [];
  process.mockReset();
  approve.mockReset();
});

describe("IssueSheet", () => {
  it("offers process for a new item and links to the source", () => {
    hooks.items = [item("todo")];
    renderWithProviders(<IssueSheet anchor={anchor} id="p/i1" onClose={() => {}} />);
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Fix login");
    expect(screen.getByText(/OTEVŘÍT V JIRA/)).toHaveAttribute("href", "https://jira.test/ZB-1");
    fireEvent.click(screen.getByText("ZPRACOVAT DO ÚKOLU"));
    expect(process).toHaveBeenCalledOnce();
  });

  it("renders the description as markdown with raw HTML escaped", () => {
    hooks.items = [item("todo")];
    renderWithProviders(<IssueSheet anchor={anchor} id="p/i1" onClose={() => {}} />);
    expect(screen.getByTestId(MarkdownTestId.Strong)).toHaveTextContent("two");
    expect(screen.getByTestId(MarkdownTestId.Root)).toHaveTextContent("<b>raw</b>");
  });

  it("shows the fallback when the item has no description", () => {
    hooks.items = [{ ...item("todo"), description: "" }];
    renderWithProviders(<IssueSheet anchor={anchor} id="p/i1" onClose={() => {}} />);
    expect(screen.queryByTestId(MarkdownTestId.Root)).toBeNull();
    expect(screen.getByText("Zdroj nemá žádný popis.")).toBeInTheDocument();
  });

  it("has no process action once the item is running", () => {
    hooks.items = [item("running")];
    renderWithProviders(<IssueSheet anchor={anchor} id="p/i1" onClose={() => {}} />);
    expect(screen.queryByText("ZPRACOVAT DO ÚKOLU")).toBeNull();
  });
});

describe("TaskSheet", () => {
  it("shows chain cards and the pending approval of a subtask run with working APPROVE", () => {
    hooks.task = {
      id: "task-abcd",
      title: "Build it",
      text: "Build the thing",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "dispatched",
      subtasks: [
        { taskId: "s1", department: "engineering", state: "working", runRef: "run-1" },
        { taskId: "s2", department: "qa", state: "thinking" },
      ],
    };
    hooks.approvals = [
      {
        id: "ap-9",
        runId: "run-1",
        kind: "workflow",
        skill: "x",
        action: "run",
        detail: "Go?",
        text: "Go?",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderWithProviders(<TaskSheet anchor={anchor} id="task-abcd" onClose={() => {}} />);
    expect(screen.getAllByTestId(StatCellTestId.Root)).toHaveLength(2);
    fireEvent.click(screen.getByTestId(NeedsYouCardTestId.Approve));
    expect(approve).toHaveBeenCalledWith({ params: { id: "ap-9" }, body: {} });
  });
});
