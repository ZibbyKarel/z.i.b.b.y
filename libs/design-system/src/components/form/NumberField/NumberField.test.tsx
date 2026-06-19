import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { NumberField, NumberFieldTestId } from "./NumberField";

describe("NumberField", () => {
  it("associates the label with the input", () => {
    render(<NumberField label="Tick (ms)" value={30000} />);
    expect(screen.getByTestId(NumberFieldTestId.Control)).toHaveAccessibleName("Tick (ms)");
  });

  it("reports the parsed number on change", async () => {
    const onValueChange = vi.fn();
    render(<NumberField label="Tick" onValueChange={onValueChange} value={null} />);
    await userEvent.type(screen.getByTestId(NumberFieldTestId.Control), "5");
    expect(onValueChange).toHaveBeenLastCalledWith(5);
  });

  it("reports null when cleared", async () => {
    const onValueChange = vi.fn();
    render(<NumberField label="Tick" onValueChange={onValueChange} value={7} />);
    await userEvent.clear(screen.getByTestId(NumberFieldTestId.Control));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it("renders an error and marks the input invalid", () => {
    render(<NumberField error="Musí být kladné" label="Tick" value={-1} />);
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Musí být kladné");
    expect(screen.getByTestId(NumberFieldTestId.Control)).toHaveAttribute("aria-invalid", "true");
  });
});
