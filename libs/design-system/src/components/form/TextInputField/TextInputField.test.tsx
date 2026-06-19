import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { TextInputField, TextInputFieldTestId } from "./TextInputField";

describe("TextInputField", () => {
  it("associates the label with the input", () => {
    render(<TextInputField label="Název skillu" />);
    expect(screen.getByTestId(TextInputFieldTestId.Control)).toHaveAccessibleName("Název skillu");
  });

  it("accepts typing", async () => {
    const onChange = vi.fn();
    render(<TextInputField label="Název" onChange={onChange} />);
    await userEvent.type(screen.getByTestId(TextInputFieldTestId.Control), "rohlik");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders an error and marks the input invalid", () => {
    render(<TextInputField error="Povinné pole" label="Název" />);
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole");
    expect(screen.getByTestId(TextInputFieldTestId.Control)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
