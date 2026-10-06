import { RailTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { PinnedRail, PinnedRailTestId } from "./PinnedRail";

const { hooks } = vi.hoisted(() => ({
  hooks: { pagePins: [] as { kind: "page"; id: string; label: string }[], unpinPage: vi.fn() },
}));
vi.mock("../usePagePins", () => ({
  usePagePins: () => ({
    pagePins: hooks.pagePins,
    isPagePinned: (href: string) => hooks.pagePins.some((p) => p.id === href),
    pinPage: vi.fn(),
    unpinPage: hooks.unpinPage,
    isPending: false,
  }),
}));

describe("PinnedRail", () => {
  beforeEach(() => {
    hooks.pagePins = [];
    hooks.unpinPage.mockReset();
    window.localStorage.clear();
  });

  it("renders the dashed empty state when there are no pins", () => {
    render(<PinnedRail currentHref="/org" />);
    expect(screen.getByTestId(PinnedRailTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(PinnedRailTestId.Row)).toBeNull();
  });

  it("renders a row per page pin with its label and kind tag", () => {
    hooks.pagePins = [
      { kind: "page", id: "/org/people", label: "People" },
      { kind: "page", id: "/work/tasks", label: "Tasks" },
    ];
    render(<PinnedRail currentHref="/org" />);
    const rows = screen.getAllByTestId(PinnedRailTestId.Row);
    expect(rows).toHaveLength(2);
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getAllByTestId(PinnedRailTestId.Kind)).toHaveLength(2);
  });

  it("includes the two-digit pin count in the header title", () => {
    hooks.pagePins = [{ kind: "page", id: "/org/people", label: "People" }];
    render(<PinnedRail currentHref="/org" />);
    expect(screen.getByTestId(RailTestId.ToggleButton)).toHaveTextContent("01");
  });

  it("marks the row matching the current href as active", () => {
    hooks.pagePins = [
      { kind: "page", id: "/org/people", label: "People" },
      { kind: "page", id: "/work/tasks", label: "Tasks" },
    ];
    render(<PinnedRail currentHref="/org/people" />);
    const rows = screen.getAllByTestId(PinnedRailTestId.Row);
    expect(rows[0]).toHaveStyle({ background: "var(--color-panel-2)" });
    expect(rows[1]).not.toHaveStyle({ background: "var(--color-panel-2)" });
  });

  it("unpins a row when its × button is clicked", async () => {
    hooks.pagePins = [{ kind: "page", id: "/org/people", label: "People" }];
    render(<PinnedRail currentHref="/org" />);
    await userEvent.click(screen.getByTestId(PinnedRailTestId.Unpin));
    expect(hooks.unpinPage).toHaveBeenCalledWith("/org/people");
  });

  it("collapses on toggle and persists the choice to localStorage", async () => {
    hooks.pagePins = [{ kind: "page", id: "/org/people", label: "People" }];
    render(<PinnedRail currentHref="/org" />);
    expect(screen.getByTestId(RailTestId.Body)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId(RailTestId.ToggleButton));
    expect(screen.queryByTestId(RailTestId.Body)).toBeNull();
    expect(window.localStorage.getItem("zibby-pinned-rail-open")).toBe("0");
  });

  it("defaults open, and reopens from a stored closed choice on mount", () => {
    window.localStorage.setItem("zibby-pinned-rail-open", "0");
    hooks.pagePins = [{ kind: "page", id: "/org/people", label: "People" }];
    render(<PinnedRail currentHref="/org" />);
    expect(screen.queryByTestId(RailTestId.Body)).toBeNull();
  });
});
