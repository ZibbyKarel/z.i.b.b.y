import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { ToggleField, ToggleFieldTestId } from "./ToggleField";

describe("ToggleField", () => {
  it("renders a labelled switch and toggles", async () => {
    const onChange = vi.fn();
    render(<ToggleField checked={false} label="Auto-run" onChange={onChange} />);
    const control = screen.getByTestId(ToggleFieldTestId.Control);
    expect(control).toHaveRole("switch");
    expect(control).toHaveAccessibleName("Auto-run");
    expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows a hint linked to the switch", () => {
    render(<ToggleField checked hint="Spustí se po uložení" label="Auto-run" onChange={vi.fn()} />);
    const hint = screen.getByTestId(FieldTestId.Hint);
    expect(hint).toHaveTextContent("Spustí se po uložení");
    expect(screen.getByTestId(ToggleFieldTestId.Control)).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
  });
});
