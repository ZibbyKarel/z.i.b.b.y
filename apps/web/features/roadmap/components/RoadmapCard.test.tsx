import type { RoadmapItem } from "@zibby/contracts";
import { ChipTestId, MenuButtonTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { RoadmapCard, RoadmapCardTestId } from "./RoadmapCard";

const restartRoadmapItem = vi.fn();
const resumeRoadmapItem = vi.fn();

vi.mock("../mutations/useRestartRoadmapItemMutation", () => ({
  useRestartRoadmapItemMutation: () => ({ mutate: restartRoadmapItem, isPending: false }),
}));
vi.mock("../mutations/useResumeRoadmapItemMutation", () => ({
  useResumeRoadmapItemMutation: () => ({ mutate: resumeRoadmapItem, isPending: false }),
}));

function item(partial: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    projectId: "proj-1",
    level: "task",
    name: partial.id,
    description: "Zapnout novou detekci za feature flagem.",
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

describe("RoadmapCard", () => {
  beforeEach(() => {
    restartRoadmapItem.mockClear();
    resumeRoadmapItem.mockClear();
  });

  it("links the external key out to source.url when both are present", () => {
    const jiraItem = item({
      id: "t1",
      name: "Rollout za flagem",
      source: { kind: "jira", externalKey: "PROJ-14", url: "https://jira.example/PROJ-14" },
    });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={jiraItem}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    const link = screen.getByTestId(RoadmapCardTestId.ExternalLink);
    expect(link).toHaveAttribute("href", "https://jira.example/PROJ-14");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("PROJ-14");
  });

  it("renders a manual item's key without faking a link", () => {
    const manualItem = item({ id: "manual-1", name: "Manual task" });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={manualItem}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(RoadmapCardTestId.ExternalLink)).not.toBeInTheDocument();
    expect(screen.getByTestId(RoadmapCardTestId.ExternalKey)).toHaveTextContent("manual-1");
  });

  it("collapses several blockers into exactly one badge, not one chip per blocker (the regression)", () => {
    const blockers = [
      item({ id: "blocker-a", name: "A" }),
      item({ id: "blocker-b", name: "B" }),
      item({ id: "blocker-c", name: "C" }),
    ];
    render(
      <RoadmapCard
        blockers={blockers}
        column="blocked"
        dependents={[]}
        item={item({
          id: "t2b",
          name: "Blocked by three",
          dependsOn: ["blocker-a", "blocker-b", "blocker-c"],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId(RoadmapCardTestId.Blocker)).toHaveLength(1);
    expect(screen.getByText("blokován (3)")).toBeInTheDocument();
  });

  it("shows čeká with no count for exactly one blocker", () => {
    const blocker = item({ id: "blocker-2", name: "PROJ-9" });
    render(
      <RoadmapCard
        blockers={[blocker]}
        column="blocked"
        dependents={[]}
        item={item({ id: "t3", name: "Blocked task 2", dependsOn: ["blocker-2"] })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.getByText("čeká")).toBeInTheDocument();
  });

  it("tones the blocked badge bad when any blocker is archived — a dead end, not an ordinary wait", () => {
    const archived = item({ id: "blocker-arch", name: "PROJ-1", lifecycle: "archived" });
    const live = item({ id: "blocker-live", name: "PROJ-2" });
    render(
      <RoadmapCard
        blockers={[archived, live]}
        column="blocked"
        dependents={[]}
        item={item({
          id: "t2c",
          name: "Blocked mixed",
          dependsOn: ["blocker-arch", "blocker-live"],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    const chip = within(screen.getByTestId(RoadmapCardTestId.Blocker)).getByTestId(ChipTestId.Root);
    expect(chip.className).toContain("text-bad");
  });

  it("tones the blocked badge wait when every blocker is still live", () => {
    const live = item({ id: "blocker-live2", name: "PROJ-3" });
    render(
      <RoadmapCard
        blockers={[live]}
        column="blocked"
        dependents={[]}
        item={item({ id: "t2d", name: "Blocked live", dependsOn: ["blocker-live2"] })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    const chip = within(screen.getByTestId(RoadmapCardTestId.Blocker)).getByTestId(ChipTestId.Root);
    expect(chip.className).toContain("text-warn");
  });

  it("the tooltip lists every blocker's title, marking the archived one", async () => {
    const archived = item({ id: "blocker-arch2", name: "Archived issue", lifecycle: "archived" });
    const live = item({ id: "blocker-live3", name: "Live issue" });
    render(
      <RoadmapCard
        blockers={[archived, live]}
        column="blocked"
        dependents={[]}
        item={item({
          id: "t2e",
          name: "Blocked",
          dependsOn: ["blocker-arch2", "blocker-live3"],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    await userEvent.hover(screen.getByTestId(RoadmapCardTestId.Blocker));
    const tooltip = screen.getByTestId(RoadmapCardTestId.BlockerTooltip);
    expect(tooltip).toHaveTextContent("Archived issue (archivováno)");
    expect(tooltip).toHaveTextContent("Live issue");
  });

  it("shows no blocked badge at all when there are no blockers", () => {
    const dependent = item({ id: "dep-only", name: "Dependent" });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[dependent]}
        item={item({ id: "t2f", name: "Not blocked" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(RoadmapCardTestId.Blocker)).not.toBeInTheDocument();
  });

  it("shows the selhalo state for a failed item", () => {
    const failed = item({ id: "t4", name: "Failed task", lifecycle: "failed" });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={failed}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.getByTestId(RoadmapCardTestId.Failed)).toHaveTextContent("Selhalo");
  });

  it("enables the play button for a todo item (125e wires it up)", () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({ id: "t5", name: "Task", lifecycle: "todo" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    const play = screen.getByTestId(RoadmapCardTestId.Play);
    expect(play).not.toBeDisabled();
  });

  it("disables the play button once the item is no longer todo (already in flight)", () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="in-progress"
        dependents={[]}
        item={item({ id: "t5b", name: "Task", lifecycle: "running" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    const play = screen.getByTestId(RoadmapCardTestId.Play);
    expect(play).toBeDisabled();
    expect(play).toHaveAccessibleName(/nejde spustit/);
  });

  it("replaces play with a restart/resume menu once the item has failed", async () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({
          id: "t5c",
          name: "Failed task",
          lifecycle: "failed",
          runs: [
            {
              taskId: "task-1",
              runRef: "run-1",
              startedAt: "2026-07-01T00:00:00.000Z",
              outcome: "failed",
            },
          ],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(RoadmapCardTestId.Play)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-restart`));
    expect(restartRoadmapItem).toHaveBeenCalledWith({
      params: { projectId: "proj-1", itemId: "t5c" },
      body: {},
    });
  });

  it("offers resume only when the last run actually reached a dispatched task", async () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({
          id: "t5d",
          name: "Failed task, never dispatched",
          lifecycle: "failed",
          runs: [{ taskId: "task-1", startedAt: "2026-07-01T00:00:00.000Z", outcome: "failed" }],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.queryByTestId(`${MenuButtonTestId.Item}-resume`)).not.toBeInTheDocument();
  });

  it("resumes a failed item whose last run has a runRef", async () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({
          id: "t5e",
          name: "Failed task",
          lifecycle: "failed",
          runs: [
            {
              taskId: "task-1",
              runRef: "run-1",
              startedAt: "2026-07-01T00:00:00.000Z",
              outcome: "failed",
            },
          ],
        })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-resume`));
    expect(resumeRoadmapItem).toHaveBeenCalledWith({
      params: { projectId: "proj-1", itemId: "t5e" },
      body: {},
    });
  });

  it("opens the detail dialog when the name/description area is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({ id: "t6", name: "Click me" })}
        onHoverChange={vi.fn()}
        onSelect={onSelect}
        onSelectDependency={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId(RoadmapCardTestId.Open));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("clicking the blocked badge opens this card's own detail, not a blocker's (per-blocker click-through lives in the dialog)", async () => {
    const onSelect = vi.fn();
    const onSelectDependency = vi.fn();
    const blocker = item({ id: "blocker-3", name: "PROJ-3" });
    render(
      <RoadmapCard
        blockers={[blocker]}
        column="blocked"
        dependents={[]}
        item={item({ id: "t7", name: "Blocked", dependsOn: ["blocker-3"] })}
        onHoverChange={vi.fn()}
        onSelect={onSelect}
        onSelectDependency={onSelectDependency}
      />,
    );
    await userEvent.click(screen.getByTestId(RoadmapCardTestId.Blocker));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelectDependency).not.toHaveBeenCalled();
  });

  it("shows a single-dependent badge as clickable, selecting that dependent", async () => {
    const onSelectDependency = vi.fn();
    const dependent = item({ id: "dep-1", name: "Dependent" });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[dependent]}
        item={item({ id: "t8", name: "Blocks one" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={onSelectDependency}
      />,
    );
    await userEvent.click(screen.getByTestId(RoadmapCardTestId.Dependents));
    expect(onSelectDependency).toHaveBeenCalledWith("dep-1");
    expect(screen.getByText("blokuje 1")).toBeInTheDocument();
  });

  it("shows the dependents count for multiple dependents", () => {
    const dependents = [item({ id: "dep-a", name: "A" }), item({ id: "dep-b", name: "B" })];
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={dependents}
        item={item({ id: "t9", name: "Blocks two" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.getByText("blokuje 2")).toBeInTheDocument();
  });

  it("renders the epic chip when `epic` is passed (126c/D2 all-tasks mode)", () => {
    const epic = item({ id: "epic-1", level: "epic", name: "Rate limiting" });
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        epic={epic}
        item={item({ id: "t10", name: "Task" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.getByTestId(RoadmapCardTestId.Epic)).toHaveTextContent("Rate limiting");
  });

  it("has no epic chip when `epic` is not passed (epic-filtered mode)", () => {
    render(
      <RoadmapCard
        blockers={[]}
        column="ready"
        dependents={[]}
        item={item({ id: "t11", name: "Task" })}
        onHoverChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectDependency={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(RoadmapCardTestId.Epic)).not.toBeInTheDocument();
  });
});
