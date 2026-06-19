import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ButtonGroupTestId } from "../../ButtonGroup/ButtonGroup";
import { SegmentPickerField } from "./SegmentPickerField";

describe("SegmentPickerField", () => {
  it("marks the active option as pressed and switches", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentPickerField
        label="Kontext"
        onValueChange={onValueChange}
        options={[
          { value: "home", label: "home" },
          { value: "work", label: "work" },
        ]}
        value="home"
      />,
    );
    expect(screen.getByTestId(ButtonGroupTestId.Root)).toHaveAccessibleName("Kontext");
    const home = screen.getByTestId(`${ButtonGroupTestId.Option}-home`);
    expect(home).toHaveAccessibleName("home");
    expect(home).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-work`));
    expect(onValueChange).toHaveBeenCalledWith("work");
  });
});
