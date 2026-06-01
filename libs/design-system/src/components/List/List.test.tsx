import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { List, ListTestId } from "./List";
import type { ListItem } from "./List";

const items: ListItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

describe("List", () => {
  it("marks the active item with aria-current", () => {
    render(<List items={items} active="overview" onNavigate={() => {}} />);
    expect(screen.getByTestId(`${ListTestId.Item}-overview`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("navigates on click", async () => {
    const onNav = vi.fn();
    render(<List items={items} active="overview" onNavigate={onNav} />);
    await userEvent.click(screen.getByTestId(`${ListTestId.Item}-pipelines`));
    expect(onNav).toHaveBeenCalledWith("pipelines");
  });

  it("renders a badge", () => {
    render(<List items={items} active="overview" onNavigate={() => {}} />);
    expect(screen.getByTestId(`${ListTestId.Badge}-runs`)).toHaveTextContent("2");
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
    expect(screen.getByTestId(`${ListTestId.Item}-settings`)).toHaveAccessibleName(
      "Nastavení systému",
    );
  });
});
