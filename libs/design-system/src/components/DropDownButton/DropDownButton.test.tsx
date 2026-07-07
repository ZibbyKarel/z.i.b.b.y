import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropDownButton, DropDownButtonTestId } from "./DropDownButton";
import { ButtonTestId } from "../Button/Button";
import type { DropDownButtonItem } from "./DropDownButton";

const ITEMS: DropDownButtonItem[] = [
  { id: "in-1h", label: "in 1h", onSelect: vi.fn() },
  { id: "on-limits", label: "when limits reset", onSelect: vi.fn() },
  { id: "later", label: "later", disabled: true, onSelect: vi.fn() },
];

function makeItems(): DropDownButtonItem[] {
  return [
    { id: "in-1h", label: "in 1h", onSelect: vi.fn() },
    { id: "on-limits", label: "when limits reset", onSelect: vi.fn() },
    { id: "later", label: "later", disabled: true, onSelect: vi.fn() },
  ];
}

describe("DropDownButton", () => {
  it("renders the primary label and fires onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={ITEMS} onClick={onClick} />);
    const primary = screen.getByTestId(DropDownButtonTestId.Primary);
    expect(primary).toHaveRole("button");
    expect(primary).toHaveTextContent("Spustit");
    await user.click(primary);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is collapsed by default with the chevron trigger closed", () => {
    render(<DropDownButton label="Spustit" menuItems={ITEMS} onClick={vi.fn()} />);
    const trigger = screen.getByTestId(DropDownButtonTestId.Trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(DropDownButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("forwards menuAriaLabel to the chevron trigger", () => {
    render(
      <DropDownButton
        label="Spustit"
        menuAriaLabel="Naplánovat spuštění"
        menuItems={ITEMS}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId(DropDownButtonTestId.Trigger)).toHaveAccessibleName(
      "Naplánovat spuštění",
    );
  });

  it("opens the menu on chevron click", async () => {
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={ITEMS} onClick={vi.fn()} />);
    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    expect(screen.getByTestId(DropDownButtonTestId.Trigger)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const menu = screen.getByTestId(DropDownButtonTestId.Menu);
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveRole("menu");
    expect(screen.getByTestId(`${DropDownButtonTestId.Item}-in-1h`)).toHaveRole("menuitem");
  });

  it("fires the item's onSelect and closes the menu on click", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={items} onClick={vi.fn()} />);
    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-on-limits`));
    expect(items[1]!.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(DropDownButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("does not select a disabled menu item", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={items} onClick={vi.fn()} />);
    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    const laterItem = screen.getByTestId(`${DropDownButtonTestId.Item}-later`);
    expect(laterItem).toHaveAttribute("aria-disabled", "true");
    await user.click(laterItem);
    expect(items[2]!.onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId(DropDownButtonTestId.Menu)).toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the chevron", async () => {
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={ITEMS} onClick={vi.fn()} />);
    const trigger = screen.getByTestId(DropDownButtonTestId.Trigger);
    await user.click(trigger);
    expect(screen.getByTestId(DropDownButtonTestId.Menu)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(DropDownButtonTestId.Menu)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens with ArrowDown and moves the active row, selecting it with Enter", async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<DropDownButton label="Spustit" menuItems={items} onClick={vi.fn()} />);
    const trigger = screen.getByTestId(DropDownButtonTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // opens, active = index 0
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const first = screen.getByTestId(`${DropDownButtonTestId.Item}-in-1h`);
    expect(trigger).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}"); // active = index 1
    const second = screen.getByTestId(`${DropDownButtonTestId.Item}-on-limits`);
    expect(trigger).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{Enter}");
    expect(items[1]!.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(DropDownButtonTestId.Menu)).not.toBeInTheDocument();
  });

  it("shows a spinner and suppresses the click when loading", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<DropDownButton loading label="Spustit" menuItems={ITEMS} onClick={onClick} />);
    expect(screen.getByTestId(ButtonTestId.Spinner)).toBeInTheDocument();
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables both segments when disabled", () => {
    render(<DropDownButton disabled label="Spustit" menuItems={ITEMS} onClick={vi.fn()} />);
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeDisabled();
    expect(screen.getByTestId(DropDownButtonTestId.Trigger)).toBeDisabled();
  });
});
