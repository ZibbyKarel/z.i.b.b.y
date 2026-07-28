import type { RoadmapItem } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { RoadmapEpicList, RoadmapEpicListTestId } from "./RoadmapEpicList";

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

describe("RoadmapEpicList", () => {
  it("shows a progress bar with done/total for an epic with children", () => {
    const epic = item({ id: "e1", level: "epic", name: "Rate limiting", parentId: undefined });
    const items = [
      epic,
      item({ id: "t1", parentId: "e1", lifecycle: "done" }),
      item({ id: "t2", parentId: "e1", lifecycle: "todo" }),
    ];
    render(
      <RoadmapEpicList
        epics={[epic]}
        items={items}
        onSelect={vi.fn()}
        selectedEpicId={undefined}
      />,
    );
    expect(screen.getByText("1/2 tasků")).toBeInTheDocument();
  });

  it("shows the italic 'nerozfázováno' fallback for a childless epic", () => {
    const epic = item({ id: "e2", level: "epic", name: "Idea", parentId: undefined });
    render(
      <RoadmapEpicList
        epics={[epic]}
        items={[epic]}
        onSelect={vi.fn()}
        selectedEpicId={undefined}
      />,
    );
    expect(screen.getByTestId(RoadmapEpicListTestId.Unphased)).toHaveTextContent("nerozfázováno");
  });

  it("selecting a row calls onSelect with that epic's id", async () => {
    const epic = item({ id: "e3", level: "epic", name: "Selectable", parentId: undefined });
    const onSelect = vi.fn();
    render(
      <RoadmapEpicList
        epics={[epic]}
        items={[epic]}
        onSelect={onSelect}
        selectedEpicId={undefined}
      />,
    );
    await userEvent.click(screen.getByTestId(`${RoadmapEpicListTestId.Row}-e3`));
    expect(onSelect).toHaveBeenCalledWith("e3");
  });

  it("shows the blocked status pill when any child is blocked", () => {
    const epic = item({ id: "e4", level: "epic", name: "Blocked epic", parentId: undefined });
    const items = [epic, item({ id: "t1", parentId: "e4", dependsOn: ["ghost"] })];
    render(
      <RoadmapEpicList
        epics={[epic]}
        items={items}
        onSelect={vi.fn()}
        selectedEpicId={undefined}
      />,
    );
    expect(screen.getByTestId(RoadmapEpicListTestId.Status)).toHaveTextContent("Blokováno");
  });
});
