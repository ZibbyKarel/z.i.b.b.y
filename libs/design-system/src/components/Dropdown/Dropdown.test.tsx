import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, DropdownTestId } from "./Dropdown";

const OPTIONS = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

describe("Dropdown", () => {
  it("renders trigger with current option", () => {
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).toHaveTextContent("Čeština");
  });

  it("is collapsed by default", () => {
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("opens panel on trigger click", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(DropdownTestId.Panel)).toHaveRole("listbox");
  });

  it("renders all options with correct aria-selected", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toHaveAttribute("aria-selected", "true");
    expect(opts[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange and closes panel when option is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown onChange={onChange} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    await user.click(opts[1]!);
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("closes panel on Escape key", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("forwards aria-label to trigger", () => {
    render(
      <Dropdown aria-label="Jazyk rozhraní" onChange={vi.fn()} options={OPTIONS} value="cs" />,
    );
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAccessibleName("Jazyk rozhraní");
  });

  it("opens with ArrowDown and points aria-activedescendant at the selected row", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    // The selected option ("cs") is the initial active row.
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[0]!.id);
  });

  it("moves the active row with ArrowDown and selects it with Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown onChange={onChange} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // open, active = cs (index 0)
    await user.keyboard("{ArrowDown}"); // active = en (index 1)
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[1]!.id);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("wraps from the last row back to the first with ArrowDown", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="en" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // open, active = en (index 1, selected)
    await user.keyboard("{ArrowDown}"); // wrap to index 0
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[0]!.id);
  });
});
