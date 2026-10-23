import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionToggle, type OptionToggleOption, OptionToggleTestId } from "./OptionToggle";

const options: OptionToggleOption<"auto" | "ask" | "silent">[] = [
  { id: "auto", label: "Auto" },
  { id: "ask", label: "Ask" },
  { id: "silent", label: "Silent" },
];

describe("OptionToggle", () => {
  it("marks the active option as pressed", () => {
    render(<OptionToggle onChange={() => {}} options={options} value="auto" />);
    expect(screen.getByTestId(`${OptionToggleTestId.Option}-auto`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${OptionToggleTestId.Option}-ask`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders each option's label", () => {
    render(<OptionToggle options={options} value="auto" />);
    expect(screen.getByTestId(`${OptionToggleTestId.Option}-silent`)).toHaveTextContent("Silent");
  });

  it("calls onChange with the clicked option id", async () => {
    const onChange = vi.fn();
    render(<OptionToggle onChange={onChange} options={options} value="auto" />);
    await userEvent.click(screen.getByTestId(`${OptionToggleTestId.Option}-ask`));
    expect(onChange).toHaveBeenCalledWith("ask");
  });

  it("renders disabled buttons with no aria-pressed when onChange is omitted (read-only)", () => {
    render(<OptionToggle options={options} value="ask" />);
    const option = screen.getByTestId(`${OptionToggleTestId.Option}-ask`);
    expect(option).toBeDisabled();
    expect(option).not.toHaveAttribute("aria-pressed");
  });

  it("is labelled for assistive tech", () => {
    render(
      <OptionToggle ariaLabel="Handoff gate" onChange={() => {}} options={options} value="auto" />,
    );
    expect(screen.getByTestId(OptionToggleTestId.Root)).toHaveAccessibleName("Handoff gate");
  });
});
