import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetMeter, BudgetMeterTestId } from "./BudgetMeter";

describe("BudgetMeter", () => {
  it("renders the label and value", () => {
    render(<BudgetMeter label="Daily" max={100} value={42} />);
    expect(screen.getByTestId(BudgetMeterTestId.Label)).toHaveTextContent("Daily");
    expect(screen.getByTestId(BudgetMeterTestId.Value)).toHaveTextContent("42");
  });

  it("exposes the fill percentage via an ARIA meter", () => {
    render(<BudgetMeter label="Daily" max={100} value={42} />);
    const track = screen.getByTestId(BudgetMeterTestId.Track);
    expect(track).toHaveRole("meter");
    expect(track).toHaveAccessibleName("Daily");
    expect(track).toHaveAttribute("aria-valuenow", "42");
    expect(track).toHaveAttribute("aria-valuemax", "100");
  });

  it("sets the fill width from value/max", () => {
    render(<BudgetMeter label="Daily" max={100} value={50} />);
    expect(screen.getByTestId(BudgetMeterTestId.Fill)).toHaveStyle({ width: "50%" });
  });

  it("clamps the fill percentage to [0, 100]", () => {
    render(<BudgetMeter label="Daily" max={100} value={150} />);
    expect(screen.getByTestId(BudgetMeterTestId.Fill)).toHaveStyle({ width: "100%" });
  });

  it("renders warn/stop ticks only when provided", () => {
    const { rerender } = render(<BudgetMeter label="Daily" max={100} value={50} />);
    expect(screen.queryByTestId(BudgetMeterTestId.WarnTick)).not.toBeInTheDocument();
    expect(screen.queryByTestId(BudgetMeterTestId.StopTick)).not.toBeInTheDocument();
    rerender(<BudgetMeter label="Daily" max={100} stopAt={95} value={50} warnAt={80} />);
    expect(screen.getByTestId(BudgetMeterTestId.WarnTick)).toHaveStyle({ left: "80%" });
    expect(screen.getByTestId(BudgetMeterTestId.StopTick)).toHaveStyle({ left: "95%" });
  });

  it("renders the caption only when provided", () => {
    render(<BudgetMeter caption="Resets at midnight." label="Daily" max={100} value={50} />);
    expect(screen.getByTestId(BudgetMeterTestId.Caption)).toHaveTextContent("Resets at midnight.");
  });
});
