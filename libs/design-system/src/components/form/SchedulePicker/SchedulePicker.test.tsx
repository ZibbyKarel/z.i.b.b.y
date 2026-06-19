import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ButtonGroupTestId } from "../../ButtonGroup/ButtonGroup";
import { DropdownTestId } from "../../Dropdown/Dropdown";
import { type Schedule, SchedulePicker, SchedulePickerTestId } from "./SchedulePicker";

const base: Schedule = { repeat: "weekly", time: "07:00", weekdays: [1, 2, 3, 4, 5], monthDay: 1 };

describe("SchedulePicker", () => {
  it("switches the repeat cadence, preserving the rest of the schedule", async () => {
    const onValueChange = vi.fn();
    render(<SchedulePicker onValueChange={onValueChange} value={base} />);

    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-monthly`));
    expect(onValueChange).toHaveBeenCalledWith({ ...base, repeat: "monthly" });
  });

  it("exposes the weekday toggles only for the weekly cadence", () => {
    const { rerender } = render(<SchedulePicker onValueChange={vi.fn()} value={base} />);
    const group = screen.getByTestId(SchedulePickerTestId.Weekdays);
    expect(group).toBeInTheDocument();
    expect(group).toHaveAccessibleName("Days of week");
    expect(screen.queryByTestId(SchedulePickerTestId.MonthDay)).not.toBeInTheDocument();

    rerender(<SchedulePicker onValueChange={vi.fn()} value={{ ...base, repeat: "monthly" }} />);
    expect(screen.queryByTestId(SchedulePickerTestId.Weekdays)).not.toBeInTheDocument();
  });

  it("exposes a day-of-month selector only for the monthly cadence", () => {
    render(<SchedulePicker onValueChange={vi.fn()} value={{ ...base, repeat: "monthly" }} />);
    expect(screen.getByTestId(SchedulePickerTestId.MonthDay)).toBeInTheDocument();
    expect(screen.queryByTestId(SchedulePickerTestId.Weekdays)).not.toBeInTheDocument();
  });

  it("reflects the selected days as pressed toggles", () => {
    render(<SchedulePicker onValueChange={vi.fn()} value={base} />);
    // Monday (1) is selected, Sunday (0) is not.
    expect(screen.getByTestId(`${SchedulePickerTestId.Weekday}-1`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${SchedulePickerTestId.Weekday}-0`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("adds a day when an unselected toggle is pressed, keeping the set sorted", async () => {
    const onValueChange = vi.fn();
    render(<SchedulePicker onValueChange={onValueChange} value={base} />);
    await userEvent.click(screen.getByTestId(`${SchedulePickerTestId.Weekday}-0`));
    expect(onValueChange).toHaveBeenCalledWith({ ...base, weekdays: [0, 1, 2, 3, 4, 5] });
  });

  it("removes a day when a selected toggle is pressed", async () => {
    const onValueChange = vi.fn();
    render(<SchedulePicker onValueChange={onValueChange} value={base} />);
    await userEvent.click(screen.getByTestId(`${SchedulePickerTestId.Weekday}-1`));
    expect(onValueChange).toHaveBeenCalledWith({ ...base, weekdays: [2, 3, 4, 5] });
  });

  it("emits the picked day of month", async () => {
    const onValueChange = vi.fn();
    render(<SchedulePicker onValueChange={onValueChange} value={{ ...base, repeat: "monthly" }} />);
    const monthDay = screen.getByTestId(SchedulePickerTestId.MonthDay);
    await userEvent.click(within(monthDay).getByTestId(DropdownTestId.Trigger));
    // Options render in a portal (document.body), so query them from `screen`, not
    // within the trigger's container. Days 1…31; index 2 is the 3rd of the month.
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[2]!);
    expect(onValueChange).toHaveBeenCalledWith({ ...base, repeat: "monthly", monthDay: 3 });
  });

  it("emits the picked time of day", async () => {
    const onValueChange = vi.fn();
    render(<SchedulePicker onValueChange={onValueChange} value={base} />);
    const time = screen.getByTestId(SchedulePickerTestId.Time);
    expect(time).toHaveValue("07:00");
    expect(time).toHaveAccessibleName("Time of day");
    fireEvent.change(time, { target: { value: "09:30" } });
    expect(onValueChange).toHaveBeenLastCalledWith({ ...base, time: "09:30" });
  });

  it("applies label overrides", () => {
    render(
      <SchedulePicker
        labels={{
          repeat: { weekly: "Týdně", monthly: "Měsíčně" },
          weekdaysShort: ["ne", "po", "út", "st", "čt", "pá", "so"],
          timeLabel: "Čas",
        }}
        onValueChange={vi.fn()}
        value={base}
      />,
    );
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-weekly`)).toHaveTextContent("Týdně");
    expect(screen.getByTestId(`${SchedulePickerTestId.Weekday}-1`)).toHaveTextContent("po");
    expect(screen.getByTestId(SchedulePickerTestId.Time)).toHaveAccessibleName("Čas");
  });
});
