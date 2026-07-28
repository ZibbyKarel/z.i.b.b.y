import { DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { LevelMappingTable } from "./LevelMappingTable";

const rows = [
  { externalLevel: "Epic", target: "epic" as const },
  { externalLevel: "Story", target: "task" as const },
];

describe("LevelMappingTable", () => {
  it("renders the column labels once as a header row, not once per row", () => {
    render(<LevelMappingTable kind="jira" onChange={vi.fn()} rows={rows} />);
    expect(screen.getByTestId("level-mapping-jira-header-level")).toHaveTextContent(
      "Externí úroveň",
    );
    expect(screen.getByTestId("level-mapping-jira-header-target")).toHaveTextContent("Cíl");
    // The per-row labels are still in the DOM (for the accessible name) but
    // visually hidden, not a second/third/... visible copy of the header.
    const visibleLevelLabels = screen
      .getAllByText("Externí úroveň")
      .filter((el) => !el.className.includes("sr-only"));
    expect(visibleLevelLabels).toHaveLength(1);
  });

  it("still gives every row's text input an accessible name", () => {
    render(<LevelMappingTable kind="jira" onChange={vi.fn()} rows={rows} />);
    const level0 = screen.getByTestId("level-mapping-jira-level-0");
    const level1 = screen.getByTestId("level-mapping-jira-level-1");
    expect(level0).toHaveAccessibleName("Externí úroveň");
    expect(level1).toHaveAccessibleName("Externí úroveň");
  });

  it("still gives every row's target picker an accessible name", () => {
    render(<LevelMappingTable kind="jira" onChange={vi.fn()} rows={rows} />);
    const wrapper = screen.getByTestId("level-mapping-jira-target-0");
    const trigger = within(wrapper).getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveAccessibleName("Cíl");
  });
});
