import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GateToggle, GateToggleTestId } from "./GateToggle";

describe("GateToggle", () => {
  it("marks the active mode as pressed", () => {
    render(<GateToggle mode="auto" onChange={() => {}} />);
    expect(screen.getByTestId(`${GateToggleTestId.Option}-auto`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${GateToggleTestId.Option}-ask`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange with the clicked mode", async () => {
    const onChange = vi.fn();
    render(<GateToggle mode="auto" onChange={onChange} />);
    await userEvent.click(screen.getByTestId(`${GateToggleTestId.Option}-ask`));
    expect(onChange).toHaveBeenCalledWith("ask");
  });

  it("renders disabled buttons with no aria-pressed when onChange is omitted (read-only)", () => {
    render(<GateToggle mode="ask" />);
    const option = screen.getByTestId(`${GateToggleTestId.Option}-ask`);
    expect(option).toBeDisabled();
    expect(option).not.toHaveAttribute("aria-pressed");
  });

  it("is labelled for assistive tech", () => {
    render(<GateToggle ariaLabel="Handoff gate" mode="auto" onChange={() => {}} />);
    expect(screen.getByTestId(GateToggleTestId.Root)).toHaveAccessibleName("Handoff gate");
  });
});
