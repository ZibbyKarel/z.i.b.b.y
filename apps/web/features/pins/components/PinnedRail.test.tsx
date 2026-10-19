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
    render(<PinnedRail currentHref="/dashboard" />);
    expect(screen.getByTestId(PinnedRailTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(PinnedRailTestId.Row)).toBeNull();
  });

  it("renders a row per page pin with its label and kind tag", () => {
    hooks.pagePins = [
      { kind: "page", id: "/workforce/agents", label: "People" },
      { kind: "page", id: "/work/tasks", label: "Tasks" },
    ];
    render(<PinnedRail currentHref="/dashboard" />);
    const rows = screen.getAllByTestId(PinnedRailTestId.Row);
    expect(rows).toHaveLength(2);
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getAllByTestId(PinnedRailTestId.Kind)).toHaveLength(2);
  });

  it("shows the pin count in the static header, with no accordion toggle", () => {
    hooks.pagePins = [{ kind: "page", id: "/workforce/agents", label: "People" }];
    render(<PinnedRail currentHref="/dashboard" />);
    expect(screen.getByTestId(RailTestId.Count)).toHaveTextContent("1");
    expect(screen.queryByTestId(RailTestId.ToggleButton)).toBeNull();
    expect(screen.getByTestId(RailTestId.Body)).toBeInTheDocument();
  });

  it("marks the row matching the current href as active", () => {
    hooks.pagePins = [
      { kind: "page", id: "/workforce/agents", label: "People" },
      { kind: "page", id: "/work/tasks", label: "Tasks" },
    ];
    render(<PinnedRail currentHref="/workforce/agents" />);
    const rows = screen.getAllByTestId(PinnedRailTestId.Row);
    expect(rows[0]).toHaveStyle({ background: "var(--color-panel-2)" });
    expect(rows[1]).not.toHaveStyle({ background: "var(--color-panel-2)" });
  });

  it("unpins a row when its × button is clicked", async () => {
    hooks.pagePins = [{ kind: "page", id: "/workforce/agents", label: "People" }];
    render(<PinnedRail currentHref="/dashboard" />);
    await userEvent.click(screen.getByTestId(PinnedRailTestId.Unpin));
    expect(hooks.unpinPage).toHaveBeenCalledWith("/workforce/agents");
  });

  it("ignores a stale stored collapsed choice and always shows the list", () => {
    window.localStorage.setItem("zibby-pinned-rail-open", "0");
    hooks.pagePins = [{ kind: "page", id: "/workforce/agents", label: "People" }];
    render(<PinnedRail currentHref="/dashboard" />);
    expect(screen.getByTestId(PinnedRailTestId.Row)).toBeInTheDocument();
  });
});
