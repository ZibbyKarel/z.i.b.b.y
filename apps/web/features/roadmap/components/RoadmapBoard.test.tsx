import type { RoadmapItem } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { RoadmapBoard, RoadmapBoardTestId } from "./RoadmapBoard";
import { RoadmapCardTestId } from "./RoadmapCard";

function item(partial: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    projectId: "proj-1",
    level: "task",
    parentId: "epic-1",
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

const epic = item({ id: "epic-1", level: "epic", name: "Rate limiting", parentId: undefined });

/** Columns render in BOARD_COLUMNS order: to-do, in-progress, done. */
const TODO = 0;
const DONE = 2;

describe("RoadmapBoard", () => {
  it("sorts each epic's children into the right column and drops archived entirely", () => {
    const blocker = item({ id: "t-blocker", name: "Blocker task" });
    const items = [
      epic,
      blocker,
      item({ id: "t-blocked", name: "Blocked task", dependsOn: ["t-blocker"] }),
      item({ id: "t-running", name: "Running task", lifecycle: "running" }),
      item({ id: "t-done", name: "Done task", lifecycle: "done" }),
      item({ id: "t-gone", name: "Archived task", lifecycle: "archived" }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    expect(screen.getByText("Blocked task")).toBeInTheDocument();
    expect(screen.getByText("Blocker task")).toBeInTheDocument();
    expect(screen.getByText("Running task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toBeInTheDocument();
    // Archived is never rendered on the board, in any column (D-004).
    expect(screen.queryByText("Archived task")).not.toBeInTheDocument();
  });

  it("renders three columns — BLOKOVANÉ is no longer one of them", () => {
    render(
      <RoadmapBoard epic={epic} items={[epic]} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const columns = screen.getAllByTestId(RoadmapBoardTestId.Column);
    expect(columns).toHaveLength(3);
    expect(columns.map((c) => within(c).getByTestId("panel-header").textContent)).toEqual([
      "To Do0",
      "In Progress0",
      "Done0",
    ]);
  });

  it("puts a blocked item in TO DO behind its badge, below everything unblocked", () => {
    const items = [
      epic,
      // Declared blocked-first on purpose: the reordering must come from the
      // grouping, not from the caller happening to pass them in a helpful order.
      item({ id: "t-blocked", name: "Blocked task", dependsOn: ["t-free"] }),
      item({ id: "t-free", name: "Free task" }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const todo = screen.getAllByTestId(RoadmapBoardTestId.Column)[TODO]!;
    const names = within(todo)
      .getAllByTestId(RoadmapCardTestId.Open)
      .map((el) => el.textContent);
    expect(names).toEqual(["Free task", "Blocked task"]);

    // The blocking is carried by the badge, which is the card's only marker for it.
    const blockedCard = within(todo)
      .getByText("Blocked task")
      .closest('[data-testid="roadmap-card"]')!;
    expect(
      within(blockedCard as HTMLElement).getByTestId(RoadmapCardTestId.Blocker),
    ).toHaveTextContent("čeká");
  });

  it("puts a failed item in TO DO, marked selhalo — never a column of its own", () => {
    const items = [epic, item({ id: "t-failed", name: "Failed task", lifecycle: "failed" })];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const todo = screen.getAllByTestId(RoadmapBoardTestId.Column)[TODO]!;
    expect(within(todo).getByText("Failed task")).toBeInTheDocument();
    expect(within(todo).getByTestId(RoadmapCardTestId.Failed)).toHaveTextContent("Selhalo");
  });

  it("keeps done items in DONE even when an edge is added to them later", () => {
    const items = [
      epic,
      item({ id: "t-blocker", name: "Blocker task" }),
      item({ id: "t-done", name: "Done task", lifecycle: "done", dependsOn: ["t-blocker"] }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const done = screen.getAllByTestId(RoadmapBoardTestId.Column)[DONE]!;
    expect(within(done).getByText("Done task")).toBeInTheDocument();
  });

  it("hovering a card highlights its blockers and dependents", async () => {
    const items = [
      epic,
      item({ id: "t-a", name: "Task A" }),
      item({ id: "t-b", name: "Task B", dependsOn: ["t-a"] }),
      item({ id: "t-c", name: "Task C" }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const cardFor = (name: string) =>
      screen.getByText(name).closest('[data-testid="roadmap-card"]');
    const cardB = cardFor("Task B")!;
    const cardA = cardFor("Task A")!;
    const cardC = cardFor("Task C")!;

    expect(cardA).not.toHaveClass("border-accent");
    await userEvent.hover(cardB);
    // Hovering B (which depends on A) highlights A (its blocker); C is unrelated.
    expect(cardA).toHaveClass("border-accent");
    expect(cardC).not.toHaveClass("border-accent");

    await userEvent.unhover(cardB);
    expect(cardA).not.toHaveClass("border-accent");
  });

  describe("all-tasks mode (126c, `epic` undefined)", () => {
    const epicB = item({ id: "epic-2", level: "epic", name: "Other epic", parentId: undefined });

    it("shows cards from two different epics", () => {
      const items = [
        epic,
        epicB,
        item({ id: "t-a", name: "Task in epic 1", parentId: "epic-1" }),
        item({ id: "t-b", name: "Task in epic 2", parentId: "epic-2" }),
      ];
      render(<RoadmapBoard items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />);

      expect(screen.getByText("Task in epic 1")).toBeInTheDocument();
      expect(screen.getByText("Task in epic 2")).toBeInTheDocument();
    });

    it("renders the all-tasks label, not an epic name, in the header", () => {
      const items = [epic, item({ id: "t-a", name: "Task A" })];
      render(<RoadmapBoard items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />);

      const header = screen.getByTestId(RoadmapBoardTestId.Header);
      expect(within(header).getByText("Všechny tasky")).toBeInTheDocument();
      expect(screen.queryByTestId(RoadmapBoardTestId.EpicDetail)).not.toBeInTheDocument();
    });
  });

  it("with epic set, only that epic's cards are present", () => {
    const otherEpic = item({ id: "epic-2", level: "epic", name: "Other", parentId: undefined });
    const items = [
      epic,
      otherEpic,
      item({ id: "t-a", name: "Task in epic 1", parentId: "epic-1" }),
      item({ id: "t-b", name: "Task in epic 2", parentId: "epic-2" }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onSelectEpic={vi.fn()} onSelectItem={vi.fn()} />,
    );

    expect(screen.getByText("Task in epic 1")).toBeInTheDocument();
    expect(screen.queryByText("Task in epic 2")).not.toBeInTheDocument();
  });
});
