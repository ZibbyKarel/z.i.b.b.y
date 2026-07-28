import type { RoadmapItem } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { RoadmapPanel, RoadmapPanelTestId } from "./RoadmapPanel";
import { RoadmapCardTestId } from "./RoadmapCard";
import { RoadmapItemDialogTestId } from "./RoadmapItemDialog";

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

const { hooks } = vi.hoisted(() => ({
  hooks: {
    items: {
      data: undefined as RoadmapItem[] | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
  },
}));

vi.mock("../queries", () => ({
  useRoadmapItemsQuery: () => hooks.items,
}));

describe("RoadmapPanel", () => {
  beforeEach(() => {
    hooks.items = { data: undefined, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("shows the empty state when the project has no epics", () => {
    hooks.items.data = [];
    render(<RoadmapPanel projectId="proj-1" />);
    expect(screen.getByTestId(RoadmapPanelTestId.Empty)).toBeInTheDocument();
  });

  it("renders the first epic's board by default and switches on selection", async () => {
    const epicA = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const epicB = item({ id: "e2", level: "epic", name: "Epic B", parentId: undefined });
    hooks.items.data = [
      epicA,
      epicB,
      item({ id: "t1", parentId: "e1", name: "Task in A" }),
      item({ id: "t2", parentId: "e2", name: "Task in B" }),
    ];
    render(<RoadmapPanel projectId="proj-1" />);

    expect(screen.getByText("Task in A")).toBeInTheDocument();
    expect(screen.queryByText("Task in B")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("roadmap-epic-row-e2"));
    expect(screen.getByText("Task in B")).toBeInTheDocument();
    expect(screen.queryByText("Task in A")).not.toBeInTheDocument();
  });

  it("opens the detail dialog when a card is clicked", async () => {
    const epic = item({ id: "e1", level: "epic", name: "Epic A", parentId: undefined });
    const task = item({ id: "t1", parentId: "e1", name: "Task in A" });
    hooks.items.data = [epic, task];
    render(<RoadmapPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(RoadmapCardTestId.Open));
    expect(screen.getByTestId(RoadmapItemDialogTestId.Root)).toBeInTheDocument();
  });
});
