import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ButtonGroupTestId } from "../../ButtonGroup/ButtonGroup";
import { FieldTestId } from "../Field";
import { SchedulePickerTestId } from "../SchedulePicker/SchedulePicker";
import { ScheduleField } from "./ScheduleField";

const base = { repeat: "weekly" as const, time: "07:00", weekdays: [1, 2, 3, 4, 5], monthDay: 1 };

describe("ScheduleField", () => {
  it("labels the picker group via the field label", () => {
    render(<ScheduleField label="Schedule" onValueChange={vi.fn()} value={base} />);
    expect(screen.getByTestId(SchedulePickerTestId.Root)).toHaveAccessibleName("Schedule");
  });

  it("surfaces an error message and marks the control invalid", () => {
    render(
      <ScheduleField error="Pick a time" label="Schedule" onValueChange={vi.fn()} value={base} />,
    );
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Pick a time");
    expect(screen.getByTestId(SchedulePickerTestId.Time)).toHaveAttribute("aria-invalid", "true");
  });

  it("forwards picker changes", async () => {
    const onValueChange = vi.fn();
    render(<ScheduleField label="Schedule" onValueChange={onValueChange} value={base} />);
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-monthly`));
    expect(onValueChange).toHaveBeenCalledWith({ ...base, repeat: "monthly" });
  });
});
