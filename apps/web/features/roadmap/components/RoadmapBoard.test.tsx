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
      <RoadmapBoard epic={epic} items={items} onCreateTask={vi.fn()} onSelectItem={vi.fn()} />,
    );

    expect(screen.getByText("Blocked task")).toBeInTheDocument();
    expect(screen.getByText("Blocker task")).toBeInTheDocument();
    expect(screen.getByText("Running task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toBeInTheDocument();
    // Archived is never rendered on the board, in any column (D-004).
    expect(screen.queryByText("Archived task")).not.toBeInTheDocument();
  });

  it("puts a failed item in READY, marked selhalo — never a column of its own", () => {
    const items = [epic, item({ id: "t-failed", name: "Failed task", lifecycle: "failed" })];
    render(
      <RoadmapBoard epic={epic} items={items} onCreateTask={vi.fn()} onSelectItem={vi.fn()} />,
    );

    const columns = screen.getAllByTestId(RoadmapBoardTestId.Column);
    // Columns render in BOARD_COLUMNS order: blocked, ready, in-progress, done.
    const readyColumn = columns[1]!;
    expect(within(readyColumn).getByText("Failed task")).toBeInTheDocument();
    expect(within(readyColumn).getByTestId(RoadmapCardTestId.Failed)).toHaveTextContent("Selhalo");
  });

  it("hovering a card highlights its blockers and dependents", async () => {
    const items = [
      epic,
      item({ id: "t-a", name: "Task A" }),
      item({ id: "t-b", name: "Task B", dependsOn: ["t-a"] }),
      item({ id: "t-c", name: "Task C" }),
    ];
    render(
      <RoadmapBoard epic={epic} items={items} onCreateTask={vi.fn()} onSelectItem={vi.fn()} />,
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

  it("the header's Nový task button calls onCreateTask", async () => {
    const onCreateTask = vi.fn();
    render(
      <RoadmapBoard
        epic={epic}
        items={[epic]}
        onCreateTask={onCreateTask}
        onSelectItem={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId(RoadmapBoardTestId.CreateTask));
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });
});
