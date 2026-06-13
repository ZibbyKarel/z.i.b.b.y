import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
  ListTestId,
} from "./List";

describe("List", () => {
  it("renders the root container", () => {
    render(
      <List>
        <ListItem onSelect={() => {}}>
          <ListItemText>Item</ListItemText>
        </ListItem>
      </List>,
    );
    expect(screen.getByTestId(ListTestId.Root)).toBeInTheDocument();
  });
});

describe("ListItem", () => {
  it("marks active item with aria-current", () => {
    render(
      <List>
        <ListItem active>
          <ListItemText>Přehled</ListItemText>
        </ListItem>
        <ListItem onSelect={() => {}}>
          <ListItemText>Skilly</ListItemText>
        </ListItem>
      </List>,
    );
    const [overviewItem, skillsItem] = screen.getAllByTestId(ListTestId.Item);
    expect(overviewItem).toHaveAttribute("aria-current", "page");
    expect(skillsItem).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect on click", async () => {
    const onSelect = vi.fn();
    render(
      <ListItem onSelect={onSelect}>
        <ListItemText>Orchestrace</ListItemText>
      </ListItem>,
    );
    await userEvent.click(screen.getByTestId(ListTestId.Item));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("renders as a button when onSelect is provided", () => {
    render(
      <ListItem onSelect={() => {}}>
        <ListItemText>Item</ListItemText>
      </ListItem>,
    );
    expect(screen.getByTestId(ListTestId.Item)).toHaveRole("button");
  });

  it("renders as a non-interactive div when no onSelect or href", () => {
    render(
      <ListItem>
        <ListItemText>Display only</ListItemText>
      </ListItem>,
    );
    const el = screen.getByTestId(ListTestId.Item);
    expect(el.tagName.toLowerCase()).toBe("div");
  });
});

describe("ListItemBadge", () => {
  it("renders badge content", () => {
    render(
      <ListItem onSelect={() => {}}>
        <ListItemText>Běžící agenti</ListItemText>
        <ListItemBadge>2</ListItemBadge>
      </ListItem>,
    );
    expect(screen.getByTestId(ListTestId.Badge)).toHaveTextContent("2");
  });
});

describe("ListItemIcon", () => {
  it("renders icon with accent color when active", () => {
    render(
      <ListItem active>
        <ListItemIcon glyph="grid" />
        <ListItemText>Přehled</ListItemText>
      </ListItem>,
    );
    const icon = screen.getByTestId(ListTestId.Icon);
    expect(icon).toHaveClass("text-accent");
  });

  it("renders icon with faint color when inactive", () => {
    render(
      <ListItem onSelect={() => {}}>
        <ListItemIcon glyph="grid" />
        <ListItemText>Přehled</ListItemText>
      </ListItem>,
    );
    const icon = screen.getByTestId(ListTestId.Icon);
    expect(icon).toHaveClass("text-foreground-faint");
  });
});
