import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownTestId } from "../../Dropdown/Dropdown";
import { FieldTestId } from "../Field";
import { SelectField } from "./SelectField";

const OPTIONS = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
];

describe("SelectField", () => {
  it("opens the dropdown and reports the chosen value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SelectField label="Model" onValueChange={onValueChange} options={OPTIONS} value="opus" />,
    );

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    await user.click(options[1]!);

    expect(onValueChange).toHaveBeenCalledWith("sonnet");
  });

  it("wires the label to the trigger for an accessible name", () => {
    render(<SelectField label="Model" onValueChange={vi.fn()} options={OPTIONS} value="opus" />);
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAccessibleName("Model");
  });

  it("associates the error message with the trigger", () => {
    render(
      <SelectField
        error="Pick a model"
        label="Model"
        onValueChange={vi.fn()}
        options={OPTIONS}
        value="opus"
      />,
    );
    const error = screen.getByTestId(FieldTestId.Error);
    expect(error).toHaveTextContent("Pick a model");
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAttribute(
      "aria-describedby",
      error.id,
    );
  });

  it("supports multi mode: reports the next value set when an option is toggled", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SelectField
        multi
        label="Models"
        onValueChange={onValueChange}
        options={OPTIONS}
        value={["opus"]}
      />,
    );
    // The multi trigger is a combobox named by its label.
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveRole("combobox");
    expect(trigger).toHaveAccessibleName("Models");

    await user.click(trigger);
    await user.click(screen.getAllByTestId(DropdownTestId.Option)[1]!);
    expect(onValueChange).toHaveBeenCalledWith(["opus", "sonnet"]);
  });
});
