import type { RoadmapItem } from "@zibby/contracts";
import { DropDownButtonTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { RoadmapPanel, RoadmapPanelTestId } from "./RoadmapPanel";
import { RoadmapBoardTestId } from "./RoadmapBoard";
import { RoadmapCardTestId } from "./RoadmapCard";
import { RoadmapItemDialogTestId } from "./RoadmapItemDialog";
import { RoadmapItemFormDialogTestId } from "./RoadmapItemFormDialog";

function item(partial: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    projectId: "proj-1",
    level: "task",
    name: partial.id,
    description: "",
    source: { kind: "manual" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

// `?item=<id>` is what makes the panel deep-linkable (the landing half of the
// run -> issue link), so this test file needs to drive the query string. Overrides
// the global next/navigation stub in vitest.setup.tsx, whose `useSearchParams` is
// always empty; `search.current` is reset per test in `beforeEach`.
const { search } = vi.hoisted(() => ({ search: { current: "" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/projects/proj-1",
  useSearchParams: () => new URLSearchParams(search.current),
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    items: {
      data: undefined as RoadmapItem[] | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    config: {
      data: undefined as { autoSync: boolean } | undefined,
      isPending: false,
    },
    setConfig: { mutate: vi.fn(), isPending: false },
    sync: { mutate: vi.fn(), isPending: false },
    create: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
    update: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
    play: { mutate: vi.fn(), isPending: false },
  },
}));

vi.mock("../queries", () => ({
  useRoadmapItemsQuery: () => hooks.items,
  useRoadmapConfigQuery: () => hooks.config,
}));

// The whole `../mutations` barrel is replaced, so every hook the panel's SUBTREE
// reaches for has to be here — not just the panel's own two. `RoadmapItemDialog`
// (dependency editing) and `RoadmapItemFormDialog` (manual create) render inside
// this panel, so omitting theirs fails at render with "No <hook> export is defined
// on the mock" rather than anything that points at the real cause.
vi.mock("../mutations", () => ({
  useSetRoadmapConfigMutation: () => hooks.setConfig,
  useSyncRoadmapItemsMutation: () => hooks.sync,
  useCreateRoadmapItemMutation: () => hooks.create,
  useUpdateRoadmapItemMutation: () => hooks.update,
  usePlayRoadmapItemMutation: () => hooks.play,
}));

describe("RoadmapPanel", () => {
  beforeEach(() => {
    search.current = "";
    hooks.items = { data: undefined, isPending: false, isError: false, refetch: vi.fn() };
    hooks.config = { data: { autoSync: false }, isPending: false };
    hooks.setConfig = { mutate: vi.fn(), isPending: false };
    hooks.sync = { mutate: vi.fn(), isPending: false };
    hooks.create = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    hooks.update = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    hooks.play = { mutate: vi.fn(), isPending: false };
  });

  it("shows the empty state when the project has no epics", () => {
    hooks.items.data = [];
    render(<RoadmapPanel projectId="proj-1" />);
    expect(screen.getByTestId(RoadmapPanelTestId.Empty)).toBeInTheDocument();
  });

  it("renders the Sync split button even on the empty state", () => {
    hooks.items.data = [];
    render(<RoadmapPanel projectId="proj-1" />);
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeInTheDocument();
  });

  it("clicking the primary Sync action calls the sync mutation for every source", async () => {
    hooks.items.data = [item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined })];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(hooks.sync.mutate).toHaveBeenCalledWith(
      { params: { projectId: "proj-1" }, body: {} },
      expect.anything(),
    );
  });

  it("picking Jira from the source menu syncs only Jira", async () => {
    hooks.items.data = [item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined })];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${DropDownButtonTestId.Item}-jira`));

    expect(hooks.sync.mutate).toHaveBeenCalledWith(
      { params: { projectId: "proj-1" }, body: { source: "jira" } },
      expect.anything(),
    );
  });

  it("picking GitHub from the source menu syncs only GitHub", async () => {
    hooks.items.data = [item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined })];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${DropDownButtonTestId.Item}-github`));

    expect(hooks.sync.mutate).toHaveBeenCalledWith(
      { params: { projectId: "proj-1" }, body: { source: "github" } },
      expect.anything(),
    );
  });

  // The auto-sync/auto-play toggles moved to `RoadmapAutomationPanel` on the
  // Integrations tab — their behaviour is covered by that component's own suite.

  describe("Nový task (in the header row, level with Sync)", () => {
    const epicA = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });

    it("sits in the panel header, not in the board's own header line", () => {
      hooks.items.data = [epicA];
      render(<RoadmapPanel projectId="proj-1" />);

      const header = screen.getByTestId(RoadmapPanelTestId.Header);
      expect(within(header).getByTestId(RoadmapPanelTestId.CreateTask)).toBeInTheDocument();
      expect(
        within(screen.getByTestId(RoadmapBoardTestId.Header)).queryByTestId(
          RoadmapPanelTestId.CreateTask,
        ),
      ).not.toBeInTheDocument();
    });

    it("is disabled in all-tasks mode — there is no epic to create the task under", () => {
      hooks.items.data = [epicA, item({ id: "t1", parentId: "e1", name: "Task in A" })];
      render(<RoadmapPanel projectId="proj-1" />);

      expect(screen.getByTestId(RoadmapPanelTestId.CreateTask)).toBeDisabled();
    });

    it("opens the create dialog once an epic is selected", async () => {
      hooks.items.data = [epicA, item({ id: "t1", parentId: "e1", name: "Task in A" })];
      render(<RoadmapPanel projectId="proj-1" />);

      await userEvent.click(screen.getByTestId("roadmap-epic-row-e1"));
      await userEvent.click(screen.getByTestId(RoadmapPanelTestId.CreateTask));

      expect(screen.getByTestId(RoadmapItemFormDialogTestId.Root)).toBeInTheDocument();
    });

    it("is absent on the empty state — there is no board to create into yet", () => {
      hooks.items.data = [];
      render(<RoadmapPanel projectId="proj-1" />);

      expect(screen.queryByTestId(RoadmapPanelTestId.CreateTask)).not.toBeInTheDocument();
    });
  });

  it("clicking the board header's epic name opens the EPIC's detail dialog", async () => {
    // Descriptions, not names: the epic's name also renders in the epic list and
    // the board header, so only body text unique to the epic proves the dialog
    // opened on the EPIC rather than on one of its tasks.
    const epicA = item({
      id: "e1",
      level: "epic",
      name: "Epic A",
      description: "Popis epicu A",
      parentId: undefined,
    });
    const taskInA = item({ id: "t1", parentId: "e1", description: "Popis tasku" });
    hooks.items.data = [epicA, taskInA];
    render(<RoadmapPanel projectId="proj-1" />);

    // Initial render is all-tasks mode (126c) — select the epic first, which
    // is the only mode the header's epic-name affordance exists in.
    await userEvent.click(screen.getByTestId("roadmap-epic-row-e1"));
    await userEvent.click(screen.getByTestId(RoadmapBoardTestId.EpicDetail));

    expect(screen.getByTestId(RoadmapItemDialogTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(RoadmapItemDialogTestId.Description)).toHaveTextContent(
      "Popis epicu A",
    );
  });

  it("shows every task on initial render — a card from a NON-FIRST epic is visible (126c)", () => {
    const epicA = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const epicB = item({ id: "e2", level: "epic", name: "Epic B", parentId: undefined });
    hooks.items.data = [
      epicA,
      epicB,
      item({ id: "t1", parentId: "e1", name: "Task in A" }),
      item({ id: "t2", parentId: "e2", name: "Task in B" }),
    ];
    render(<RoadmapPanel projectId="proj-1" />);

    // Task in B belongs to the SECOND epic — before 126c this silently never
    // rendered on first load, because the board collapsed to `epics[0]`.
    expect(screen.getByText("Task in A")).toBeInTheDocument();
    expect(screen.getByText("Task in B")).toBeInTheDocument();
  });

  it("clicking an epic row filters the board; clicking it again restores all tasks", async () => {
    const epicA = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const epicB = item({ id: "e2", level: "epic", name: "Epic B", parentId: undefined });
    hooks.items.data = [
      epicA,
      epicB,
      item({ id: "t1", parentId: "e1", name: "Task in A" }),
      item({ id: "t2", parentId: "e2", name: "Task in B" }),
    ];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId("roadmap-epic-row-e2"));
    expect(screen.getByText("Task in B")).toBeInTheDocument();
    expect(screen.queryByText("Task in A")).not.toBeInTheDocument();

    // Re-clicking the ALREADY-selected row deselects it (D1) — back to all tasks.
    await userEvent.click(screen.getByTestId("roadmap-epic-row-e2"));
    expect(screen.getByText("Task in A")).toBeInTheDocument();
    expect(screen.getByText("Task in B")).toBeInTheDocument();
  });

  it("opens the detail dialog when a card is clicked", async () => {
    const epic = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const task = item({ id: "t1", parentId: "e1", name: "Task in A" });
    hooks.items.data = [epic, task];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(RoadmapCardTestId.Open));
    expect(screen.getByTestId(RoadmapItemDialogTestId.Root)).toBeInTheDocument();
  });

  describe("?item= deep link (the run -> issue landing)", () => {
    const epicA = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const epicB = item({ id: "e2", level: "epic", name: "Epic B", parentId: undefined });
    const taskInB = item({
      id: "t2",
      parentId: "e2",
      name: "Task in B",
      description: "Popis tasku v B",
    });

    it("opens that item's dialog on mount", () => {
      search.current = "tab=roadmap&item=t2";
      hooks.items.data = [epicA, epicB, taskInB];
      render(<RoadmapPanel projectId="proj-1" />);

      expect(screen.getByTestId(RoadmapItemDialogTestId.Root)).toBeInTheDocument();
      expect(screen.getByTestId(RoadmapItemDialogTestId.Description)).toHaveTextContent(
        "Popis tasku v B",
      );
    });

    it("does NOT filter the board to the deep-linked item's epic (126c: stays all-tasks)", () => {
      search.current = "item=t2";
      hooks.items.data = [epicA, epicB, taskInB, item({ id: "t1", parentId: "e1", name: "In A" })];
      render(<RoadmapPanel projectId="proj-1" />);

      // Scoped to the board: the open dialog also renders the item's name, so an
      // unscoped query would match twice.
      const board = within(screen.getByTestId(RoadmapBoardTestId.Root));
      expect(board.getByText("Task in B")).toBeInTheDocument();
      // Both epics' tasks are visible — the deep link no longer forces a
      // selection, it just opens the dialog on top of the all-tasks board.
      expect(board.getByText("In A")).toBeInTheDocument();
    });

    it("stays in all-tasks mode after the dialog is closed", async () => {
      search.current = "item=t2";
      hooks.items.data = [epicA, epicB, taskInB, item({ id: "t1", parentId: "e1", name: "In A" })];
      render(<RoadmapPanel projectId="proj-1" />);

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByTestId(RoadmapItemDialogTestId.Root)).not.toBeInTheDocument();
      expect(screen.getByText("Task in B")).toBeInTheDocument();
      expect(screen.getByText("In A")).toBeInTheDocument();
    });

    it("ignores an id that isn't in this project's roadmap", () => {
      search.current = "item=nope";
      hooks.items.data = [epicA, item({ id: "t1", parentId: "e1", name: "In A" })];
      render(<RoadmapPanel projectId="proj-1" />);

      expect(screen.queryByTestId(RoadmapItemDialogTestId.Root)).not.toBeInTheDocument();
      expect(screen.getByText("In A")).toBeInTheDocument();
    });
  });
});
