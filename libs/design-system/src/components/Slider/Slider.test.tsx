import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Slider, SliderTestId } from "./Slider";

describe("Slider", () => {
  it("renders as a native range input with min/max/value", () => {
    render(<Slider label="Daily threshold" max={100} min={0} onChange={() => {}} value={60} />);
    const input = screen.getByTestId(SliderTestId.Input);
    expect(input).toHaveAttribute("type", "range");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "100");
    expect(input).toHaveValue("60");
  });

  it("is labelled for assistive tech", () => {
    render(<Slider label="Daily threshold" max={100} min={0} onChange={() => {}} value={60} />);
    expect(screen.getByTestId(SliderTestId.Input)).toHaveAccessibleName("Daily threshold");
  });

  it("fires onChange with the numeric value on input", () => {
    const onChange = vi.fn();
    render(<Slider label="Daily threshold" max={100} min={0} onChange={onChange} value={60} />);
    const input = screen.getByTestId(SliderTestId.Input);
    fireEvent.change(input, { target: { value: "80" } });
    expect(onChange).toHaveBeenCalledWith(80);
  });

  it("renders a raw readout by default and a formatted one when format is given", () => {
    const { rerender } = render(
      <Slider label="Daily threshold" max={100} min={0} onChange={() => {}} value={60} />,
    );
    expect(screen.getByTestId(SliderTestId.Readout)).toHaveTextContent("60");
    rerender(
      <Slider
        format={(v) => `${v}%`}
        label="Daily threshold"
        max={100}
        min={0}
        onChange={() => {}}
        value={60}
      />,
    );
    expect(screen.getByTestId(SliderTestId.Readout)).toHaveTextContent("60%");
  });

  it("renders the caption only when provided", () => {
    render(
      <Slider
        caption="Raising the cap still goes through Needs you."
        label="Daily threshold"
        max={100}
        min={0}
        onChange={() => {}}
        value={60}
      />,
    );
    expect(screen.getByTestId(SliderTestId.Caption)).toHaveTextContent(
      "Raising the cap still goes through Needs you.",
    );
  });
});
