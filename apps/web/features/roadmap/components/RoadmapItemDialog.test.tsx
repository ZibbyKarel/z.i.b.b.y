import type { RoadmapItem } from "@zibby/contracts";
import { MarkdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { RoadmapItemDialog, RoadmapItemDialogTestId } from "./RoadmapItemDialog";

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

describe("RoadmapItemDialog", () => {
  it("renders the full markdown description, not a truncated preview", () => {
    const long =
      "# Heading\n\nA long **markdown** body with more detail than any card preview would show, " +
      "including a [link](https://example.com) and a second paragraph that keeps going.";
    const target = item({ id: "t1", name: "Detail item", description: long });
    render(
      <RoadmapItemDialog itemId="t1" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
    );
    const rendered = screen.getByTestId(MarkdownTestId.Root);
    expect(rendered).toHaveTextContent("Heading");
    expect(rendered).toHaveTextContent("keeps going");
    expect(rendered.textContent).toContain("link");
  });

  it("returns nothing for an id that isn't in the item list", () => {
    render(
      <RoadmapItemDialog itemId="missing" items={[]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
    );
    expect(screen.queryByTestId(RoadmapItemDialogTestId.Root)).not.toBeInTheDocument();
  });

  it("shows attachments, blockers (marking an archived one), dependents and run history", async () => {
    const blocker = item({ id: "blocker-1", name: "PROJ-1", lifecycle: "archived" });
    const dependent = item({ id: "dep-1", name: "PROJ-2" });
    const target = item({
      id: "t2",
      name: "Detail item 2",
      attachments: [{ name: "spec.pdf", size: 1024 }],
      dependsOn: ["blocker-1"],
      runs: [
        {
          taskId: "task-1",
          startedAt: "2026-07-01T00:00:00.000Z",
          finishedAt: "2026-07-02T00:00:00.000Z",
          outcome: "done",
          prNumber: 42,
          prUrl: "https://github.com/example/repo/pull/42",
        },
      ],
    });
    const onSelectItem = vi.fn();
    render(
      <RoadmapItemDialog
        itemId="t2"
        items={[target, blocker, dependent]}
        onClose={vi.fn()}
        onSelectItem={onSelectItem}
      />,
    );

    expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PROJ-1 — zdroj ji už nevrací/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PR #42" })).toHaveAttribute(
      "href",
      "https://github.com/example/repo/pull/42",
    );

    await userEvent.click(screen.getByTestId(RoadmapItemDialogTestId.BlockerRow));
    expect(onSelectItem).toHaveBeenCalledWith("blocker-1");
  });

  it("shows the empty-state copy when there are no attachments/blockers/dependents/runs", () => {
    const target = item({ id: "t3", name: "Bare item" });
    render(
      <RoadmapItemDialog itemId="t3" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
    );
    expect(screen.getByText("Žádné přílohy")).toBeInTheDocument();
    expect(screen.getByText("Na ničem nečeká")).toBeInTheDocument();
    expect(screen.getByText("Nic neblokuje")).toBeInTheDocument();
    expect(screen.getByText("Zatím žádný běh")).toBeInTheDocument();
  });
});
