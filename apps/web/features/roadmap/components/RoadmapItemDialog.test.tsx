import type { RoadmapItem } from "@zibby/contracts";
import { DropdownTestId, MarkdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { RoadmapItemDialog, RoadmapItemDialogTestId } from "./RoadmapItemDialog";

type MutateVars = {
  params: { projectId: string; itemId: string };
  body: { dependsOn: string[] };
};

const updateRoadmapItem = vi.fn<(vars: MutateVars) => void>();

vi.mock("../mutations", () => ({
  useUpdateRoadmapItemMutation: () => ({ mutate: updateRoadmapItem, isPending: false }),
}));

// The "open run" affordance navigates — a local router mock (overriding the global
// next/navigation stub in vitest.setup.tsx) so the exact path can be asserted.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  beforeEach(() => {
    updateRoadmapItem.mockClear();
  });

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

  it("shows the failure reason for a failed item that has one", () => {
    const target = item({
      id: "t2b",
      name: "Failed item",
      lifecycle: "failed",
      lastFailureReason: "no capacity",
    });
    render(
      <RoadmapItemDialog itemId="t2b" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
    );
    expect(screen.getByTestId(RoadmapItemDialogTestId.FailureReason)).toHaveTextContent(
      "no capacity",
    );
  });

  it("omits the failure reason section when a failed item doesn't have one", () => {
    const target = item({ id: "t2c", name: "Failed item, no reason", lifecycle: "failed" });
    render(
      <RoadmapItemDialog itemId="t2c" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
    );
    expect(screen.queryByTestId(RoadmapItemDialogTestId.FailureReason)).not.toBeInTheDocument();
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

  describe("dependency editing (125f)", () => {
    it("a source-owned dependency is marked and has no remove button", () => {
      const blocker = item({ id: "blocker-src", name: "PROJ-9" });
      const target = item({
        id: "t4",
        name: "Target",
        dependsOn: ["blocker-src"],
        dependsOnFromSource: ["blocker-src"],
      });
      render(
        <RoadmapItemDialog
          itemId="t4"
          items={[target, blocker]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );
      expect(screen.getByTestId(RoadmapItemDialogTestId.SourceOwnedBadge)).toHaveTextContent(
        "zdroj",
      );
      expect(
        screen.queryByTestId(`${RoadmapItemDialogTestId.RemoveDependency}-blocker-src`),
      ).not.toBeInTheDocument();
    });

    it("removing an operator-owned dependency PATCHes the whole array, keeping source-owned edges", async () => {
      const opBlocker = item({ id: "blocker-op", name: "Operator-added" });
      const srcBlocker = item({ id: "blocker-src", name: "Source-owned" });
      const target = item({
        id: "t5",
        name: "Target",
        dependsOn: ["blocker-src", "blocker-op"],
        dependsOnFromSource: ["blocker-src"],
      });
      render(
        <RoadmapItemDialog
          itemId="t5"
          items={[target, opBlocker, srcBlocker]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );

      // No badge, and a remove button, on the operator-owned one only.
      expect(screen.queryAllByTestId(RoadmapItemDialogTestId.SourceOwnedBadge)).toHaveLength(1);
      await userEvent.click(
        screen.getByTestId(`${RoadmapItemDialogTestId.RemoveDependency}-blocker-op`),
      );

      expect(updateRoadmapItem).toHaveBeenCalledTimes(1);
      expect(updateRoadmapItem).toHaveBeenCalledWith({
        params: { projectId: "proj-1", itemId: "t5" },
        body: { dependsOn: ["blocker-src"] },
      });
    });

    it("adding a dependency PATCHes the whole array — existing edges plus the new one", async () => {
      const opBlocker = item({ id: "blocker-op", name: "Already depends on this" });
      const candidate = item({ id: "candidate-1", name: "New dependency" });
      const target = item({
        id: "t6",
        name: "Target",
        dependsOn: ["blocker-op"],
        dependsOnFromSource: [],
      });
      render(
        <RoadmapItemDialog
          itemId="t6"
          items={[target, opBlocker, candidate]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );

      const picker = within(screen.getByTestId(RoadmapItemDialogTestId.AddDependency));
      await userEvent.click(picker.getByTestId(DropdownTestId.Trigger));
      const options = screen.getAllByTestId(DropdownTestId.Option);
      const targetOption = options.find((o) => o.textContent === "New dependency")!;
      await userEvent.click(targetOption);

      expect(updateRoadmapItem).toHaveBeenCalledTimes(1);
      expect(updateRoadmapItem).toHaveBeenCalledWith({
        params: { projectId: "proj-1", itemId: "t6" },
        body: { dependsOn: ["blocker-op", "candidate-1"] },
      });
    });

    it("excludes itself and its existing dependencies from the add-dependency picker", async () => {
      const opBlocker = item({ id: "blocker-op", name: "Existing dep" });
      const other = item({ id: "other-1", name: "Some other item" });
      const target = item({
        id: "t7",
        name: "Self item",
        dependsOn: ["blocker-op"],
        dependsOnFromSource: [],
      });
      render(
        <RoadmapItemDialog
          itemId="t7"
          items={[target, opBlocker, other]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );

      const picker = within(screen.getByTestId(RoadmapItemDialogTestId.AddDependency));
      await userEvent.click(picker.getByTestId(DropdownTestId.Trigger));
      const labels = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);

      expect(labels).not.toContain("Self item");
      expect(labels).not.toContain("Existing dep");
      expect(labels).toContain("Some other item");
    });
  });

  describe("open run (the issue -> run half of the link)", () => {
    beforeEach(() => {
      push.mockClear();
    });

    it("opens a dispatched run by its runRef", async () => {
      const target = item({
        id: "t8",
        runs: [
          {
            taskId: "task-1",
            runRef: "delivery_42",
            startedAt: "2026-07-01T00:00:00.000Z",
            outcome: "running",
          },
        ],
      });
      render(
        <RoadmapItemDialog itemId="t8" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
      );

      await userEvent.click(screen.getByTestId(RoadmapItemDialogTestId.OpenRun));

      expect(push).toHaveBeenCalledWith("/archiv?run=delivery_42");
    });

    it("falls back to the taskId when the release never dispatched (queued/held — no runRef)", async () => {
      const target = item({
        id: "t9",
        runs: [{ taskId: "task-7", startedAt: "2026-07-01T00:00:00.000Z", outcome: "running" }],
      });
      render(
        <RoadmapItemDialog itemId="t9" items={[target]} onClose={vi.fn()} onSelectItem={vi.fn()} />,
      );

      await userEvent.click(screen.getByTestId(RoadmapItemDialogTestId.OpenRun));

      expect(push).toHaveBeenCalledWith("/archiv?run=task-7");
    });

    it("keeps the PR link alongside it rather than replacing it", () => {
      const target = item({
        id: "t10",
        runs: [
          {
            taskId: "task-2",
            runRef: "delivery_43",
            startedAt: "2026-07-01T00:00:00.000Z",
            outcome: "awaiting-merge",
            prUrl: "https://github.com/acme/repo/pull/7",
            prNumber: 7,
          },
        ],
      });
      render(
        <RoadmapItemDialog
          itemId="t10"
          items={[target]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );

      expect(screen.getByTestId(RoadmapItemDialogTestId.OpenRun)).toBeInTheDocument();
      expect(screen.getByText("PR #7")).toBeInTheDocument();
    });

    it("offers no affordance for an item that has never run", () => {
      render(
        <RoadmapItemDialog
          itemId="t11"
          items={[item({ id: "t11" })]}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
        />,
      );
      expect(screen.queryByTestId(RoadmapItemDialogTestId.OpenRun)).not.toBeInTheDocument();
    });
  });
});
