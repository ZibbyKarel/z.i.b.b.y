import { BoardRowTestId, DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import type { CiState } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import {
  ProjectStatusWidget,
  ProjectStatusWidgetSettings,
  ProjectStatusWidgetTestId,
} from "./ProjectStatusWidget";

const d = vi.hoisted(() => ({
  projects: [] as { id: string; name: string }[],
  ci: {} as Record<string, CiState>,
}));

vi.mock("../../projects/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../projects/queries")>()),
  useProjectsQuery: () => ({ data: d.projects, isPending: false }),
  useProjectCiQuery: (id: string) => ({
    data: d.ci[id] ? { projectId: id, state: d.ci[id], branch: "main", workflows: [] } : undefined,
  }),
}));

const widget = (scope?: BridgeWidget["scope"]): BridgeWidget => ({
  id: "w-ps",
  type: "projectStatus",
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  scope,
});
const setup = (over: Partial<BridgeWidgetProps> = {}): BridgeWidgetProps => ({
  widget: widget(),
  adding: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  ...over,
});

beforeEach(() => {
  d.projects = [
    { id: "red", name: "Red" },
    { id: "green", name: "Green" },
    { id: "busy", name: "Busy" },
  ];
  d.ci = { red: "failing", green: "passing", busy: "running" };
});

describe("ProjectStatusWidget", () => {
  it("a red project gets the error background without a bar; others a status icon", () => {
    renderWithProviders(<ProjectStatusWidget {...setup()} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(3);
    const [red, green, busy] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(red).toHaveAttribute("data-alert", "true");
    expect(red.className).not.toMatch(/border-l-\[length/);
    expect(green).not.toHaveAttribute("data-alert");
    const icon = (row: HTMLElement) => within(row).getByTestId(ProjectStatusWidgetTestId.Ci);
    expect(icon(green)).toHaveAttribute("data-state", "passing");
    expect(icon(green)).toHaveAccessibleName("CI prochází");
    expect(icon(busy)).toHaveAttribute("data-state", "running");
  });

  it("an unreachable repo shows the warn icon + CI unavailable; cancelled has its own icon", () => {
    d.projects = [
      { id: "down", name: "Down" },
      { id: "stop", name: "Stop" },
    ];
    d.ci = { down: "error", stop: "cancelled" };
    renderWithProviders(<ProjectStatusWidget {...setup()} />);
    const [down, stop] = screen.getAllByTestId(ProjectStatusWidgetTestId.Ci) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(down).toHaveAttribute("data-state", "error");
    expect(down).toHaveAccessibleName("CI nedostupné");
    expect(stop).toHaveAttribute("data-state", "cancelled");
    expect(stop).toHaveAccessibleName("Zrušeno");
    expect(screen.getAllByTestId(BoardRowTestId.Root)[0]).not.toHaveAttribute("data-alert");
  });

  it("shows only the picked projects and opens the project sheet", async () => {
    const props = setup({ widget: widget({ projectIds: ["green"] }) });
    renderWithProviders(<ProjectStatusWidget {...props} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(1);
    await userEvent.click(rows[0]!);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "project",
      id: "green",
      widgetId: "w-ps",
      key: "w-ps:green",
    });
    expect(props.onCountChange).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
  });

  it("settings pick projects into scope.projectIds", async () => {
    const onChange = vi.fn();
    const draft = widget();
    renderWithProviders(<ProjectStatusWidgetSettings draft={draft} onChange={onChange} />);
    const select = screen.getByTestId(ProjectStatusWidgetTestId.ProjectSelect);
    await userEvent.click(within(select).getByTestId(DropdownTestId.Trigger));
    const option = screen
      .getAllByTestId(DropdownTestId.Option)
      .find((o) => o.textContent === "Green");
    await userEvent.click(option!);
    expect(onChange).toHaveBeenCalledWith({ ...draft, scope: { projectIds: ["green"] } });
  });
});
