import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { Toggle, ToggleTestId } from "./Toggle";

describe("Toggle", () => {
  it("renders a labelled switch and toggles", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Auto-run" onChange={onChange} />);
    const control = screen.getByTestId(ToggleTestId.Control);
    expect(control).toHaveRole("switch");
    expect(control).toHaveAccessibleName("Auto-run");
    expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows a hint linked to the switch", () => {
    render(
      <Toggle
        checked
        hint="Spustí se po uložení"
        label="Auto-run"
        onChange={vi.fn()}
      />,
    );
    const hint = screen.getByTestId(FieldTestId.Hint);
    expect(hint).toHaveTextContent("Spustí se po uložení");
    expect(screen.getByTestId(ToggleTestId.Control)).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
  });
});
