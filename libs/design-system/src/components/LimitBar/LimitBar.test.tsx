import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LimitBar, LimitBarTestId } from "./LimitBar";

describe("LimitBar", () => {
  it("renders the label and rounded percentage", () => {
    render(<LimitBar label="5H" max={100} value={64} />);
    expect(screen.getByTestId(LimitBarTestId.Label)).toHaveTextContent("5H");
    expect(screen.getByTestId(LimitBarTestId.Value)).toHaveTextContent("64%");
  });

  it("exposes the fill via an ARIA meter", () => {
    render(<LimitBar label="WEEK" max={100} value={30} />);
    const track = screen.getByTestId(LimitBarTestId.Track);
    expect(track).toHaveRole("meter");
    expect(track).toHaveAccessibleName("WEEK");
    expect(track).toHaveAttribute("aria-valuenow", "30");
  });

  it("sets the fill width from value/max", () => {
    render(<LimitBar label="5H" max={200} value={50} />);
    expect(screen.getByTestId(LimitBarTestId.Fill)).toHaveStyle({ width: "25%" });
  });

  it("clamps the fill percentage to [0, 100]", () => {
    render(<LimitBar label="5H" max={100} value={130} />);
    expect(screen.getByTestId(LimitBarTestId.Fill)).toHaveStyle({ width: "100%" });
  });
});
