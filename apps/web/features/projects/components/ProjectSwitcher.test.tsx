import { DropdownTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { ProjectSwitcher, ProjectSwitcherTestId } from "./ProjectSwitcher";

const { store } = vi.hoisted(() => ({
  store: {
    activeProjectId: null as string | null,
    setActiveProject: vi.fn(),
  },
}));
vi.mock("../context/ProjectProvider", () => ({
  useActiveProject: () => store,
}));
vi.mock("../queries", () => ({
  useProjectsQuery: () => ({
    data: [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ],
  }),
}));

describe("ProjectSwitcher", () => {
  beforeEach(() => {
    store.activeProjectId = null;
    store.setActiveProject = vi.fn();
  });

  it("shows the persistent current selection — 'Bez projektu' by default", () => {
    renderWithProviders(<ProjectSwitcher />);
    expect(screen.getByTestId(ProjectSwitcherTestId.Root)).toBeInTheDocument();
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    // Role/ARIA as assertions only — the selector stays the testid.
    expect(trigger).toHaveRole("button");
    expect(trigger).toHaveAccessibleName("Aktivní projekt");
    expect(trigger).toHaveTextContent("Bez projektu");
  });

  it("shows the active project's name in the closed trigger", () => {
    store.activeProjectId = "beta";
    renderWithProviders(<ProjectSwitcher />);
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Beta");
  });

  it("lists 'Bez projektu' + every project and switches via setActiveProject", () => {
    renderWithProviders(<ProjectSwitcher />);
    fireEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    expect(options.map((o) => o.textContent)).toEqual(["Bez projektu", "Alpha", "Beta"]);

    const alpha = options[1];
    expect(alpha).toBeDefined();
    if (alpha) fireEvent.click(alpha);
    expect(store.setActiveProject).toHaveBeenCalledWith("alpha");
  });

  it("maps the 'Bez projektu' option back to null", () => {
    store.activeProjectId = "alpha";
    renderWithProviders(<ProjectSwitcher />);
    fireEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const noProject = screen.getAllByTestId(DropdownTestId.Option)[0];
    expect(noProject).toBeDefined();
    if (noProject) fireEvent.click(noProject);
    expect(store.setActiveProject).toHaveBeenCalledWith(null);
  });
});
