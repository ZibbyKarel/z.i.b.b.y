import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuButton, MenuButtonTestId } from "./MenuButton";
import type { MenuButtonItem } from "./MenuButton";

function makeItems(): MenuButtonItem[] {
  return [
    { id: "resume", label: "Pokračovat", onSelect: vi.fn() },
    { id: "stop", label: "Zastavit běh", danger: true, onSelect: vi.fn() },
    { id: "later", label: "later", disabled: true, onSelect: vi.fn() },
  ];
}

describe("MenuButton", () => {
  it("is collapsed by default with the kebab trigger closed", () => {
    render(<MenuButton items={makeItems()} />);
    const trigger = screen.getByTestId(MenuButtonTestId.Trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(MenuButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("defaults the trigger's accessible name to 'Actions'", () => {
    render(<MenuButton items={makeItems()} />);
    expect(screen.getByTestId(MenuButtonTestId.Trigger)).toHaveAccessibleName("Actions");
  });

  it("forwards a custom ariaLabel to the trigger", () => {
    render(<MenuButton ariaLabel="Akce běhu" items={makeItems()} />);
    expect(screen.getByTestId(MenuButtonTestId.Trigger)).toHaveAccessibleName("Akce běhu");
  });

  it("opens the menu on click and renders the action rows", async () => {
    const user = userEvent.setup();
    render(<MenuButton items={makeItems()} />);
    await user.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.getByTestId(MenuButtonTestId.Trigger)).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByTestId(MenuButtonTestId.Menu);
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveRole("menu");
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-resume`)).toHaveRole("menuitem");
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-stop`)).toHaveRole("menuitem");
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-later`)).toHaveRole("menuitem");
  });

  it("fires the item's onSelect and closes the menu on click", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<MenuButton items={items} />);
    await user.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await user.click(screen.getByTestId(`${MenuButtonTestId.Item}-stop`));
    expect(items[1]!.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(MenuButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("paints a danger item's row with the bad token", async () => {
    const user = userEvent.setup();
    render(<MenuButton items={makeItems()} />);
    await user.click(screen.getByTestId(MenuButtonTestId.Trigger));
    const stopItem = screen.getByTestId(`${MenuButtonTestId.Item}-stop`);
    expect(stopItem).toHaveTextContent("Zastavit běh");
    expect(stopItem.querySelector("span")).toHaveClass("text-bad");
  });

  it("does not select a disabled menu item", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<MenuButton items={items} />);
    await user.click(screen.getByTestId(MenuButtonTestId.Trigger));
    const laterItem = screen.getByTestId(`${MenuButtonTestId.Item}-later`);
    expect(laterItem).toHaveAttribute("aria-disabled", "true");
    await user.click(laterItem);
    expect(items[2]!.onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId(MenuButtonTestId.Menu)).toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<MenuButton items={makeItems()} />);
    const trigger = screen.getByTestId(MenuButtonTestId.Trigger);
    await user.click(trigger);
    expect(screen.getByTestId(MenuButtonTestId.Menu)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(MenuButtonTestId.Menu)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens with ArrowDown and moves the active row, selecting it with Enter", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<MenuButton items={items} />);
    const trigger = screen.getByTestId(MenuButtonTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // opens, active = index 0
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const first = screen.getByTestId(`${MenuButtonTestId.Item}-resume`);
    expect(trigger).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}"); // active = index 1
    const second = screen.getByTestId(`${MenuButtonTestId.Item}-stop`);
    expect(trigger).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{Enter}");
    expect(items[1]!.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(MenuButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("disables the trigger when disabled", () => {
    render(<MenuButton disabled items={makeItems()} />);
    expect(screen.getByTestId(MenuButtonTestId.Trigger)).toBeDisabled();
  });
});
