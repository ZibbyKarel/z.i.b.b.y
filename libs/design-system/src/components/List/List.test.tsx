import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemBadge,
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
        <ListItem active data-testid={`${ListTestId.Item}-overview`}>
          <ListItemText>Přehled</ListItemText>
        </ListItem>
        <ListItem data-testid={`${ListTestId.Item}-skills`} onSelect={() => {}}>
          <ListItemText>Skilly</ListItemText>
        </ListItem>
      </List>,
    );
    expect(screen.getByTestId(`${ListTestId.Item}-overview`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByTestId(`${ListTestId.Item}-skills`),
    ).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect on click", async () => {
    const onSelect = vi.fn();
    render(
      <ListItem
        data-testid={`${ListTestId.Item}-pipelines`}
        onSelect={onSelect}
      >
        <ListItemText>Orchestrace</ListItemText>
      </ListItem>,
    );
    await userEvent.click(
      screen.getByTestId(`${ListTestId.Item}-pipelines`),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("renders as a button when onSelect is provided", () => {
    render(
      <ListItem data-testid={ListTestId.Item} onSelect={() => {}}>
        <ListItemText>Item</ListItemText>
      </ListItem>,
    );
    expect(screen.getByTestId(ListTestId.Item)).toHaveRole("button");
  });

  it("renders as a non-interactive div when no onSelect or href", () => {
    render(
      <ListItem data-testid={ListTestId.Item}>
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
        <ListItemBadge data-testid={`${ListTestId.Badge}-runs`}>2</ListItemBadge>
      </ListItem>,
    );
    expect(screen.getByTestId(`${ListTestId.Badge}-runs`)).toHaveTextContent(
      "2",
    );
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
    // Icon wrapper should carry text-accent class
    const icon = screen.getByTestId(ListTestId.Item).querySelector(".text-accent");
    expect(icon).not.toBeNull();
  });

  it("renders icon with faint color when inactive", () => {
    render(
      <ListItem onSelect={() => {}}>
        <ListItemIcon glyph="grid" />
        <ListItemText>Přehled</ListItemText>
      </ListItem>,
    );
    const icon = screen
      .getByTestId(ListTestId.Item)
      .querySelector(".text-foreground-faint");
    expect(icon).not.toBeNull();
  });
});
