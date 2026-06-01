import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { List } from "./List";
import type { ListItem } from "./List";

const items: ListItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

describe("List", () => {
  it("marks the active item with aria-current", () => {
    render(<List items={items} active="overview" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Přehled" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("navigates on click", async () => {
    const onNav = vi.fn();
    render(<List items={items} active="overview" onNavigate={onNav} />);
    await userEvent.click(screen.getByRole("button", { name: "Orchestrace" }));
    expect(onNav).toHaveBeenCalledWith("pipelines");
  });

  it("renders a badge", () => {
    render(<List items={items} active="overview" onNavigate={() => {}} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders a pinned footer item", () => {
    render(
      <List
        items={items}
        active="overview"
        onNavigate={() => {}}
        footerItem={{ id: "settings", label: "Nastavení systému", glyph: "gear" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Nastavení systému" }),
    ).toBeInTheDocument();
  });
});
