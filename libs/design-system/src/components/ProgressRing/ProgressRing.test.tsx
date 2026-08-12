import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing, ProgressRingTestId } from "./ProgressRing";

describe("ProgressRing", () => {
  it("exposes a progressbar role when labelled", () => {
    render(<ProgressRing label="5h rolling" value={64} />);
    const ring = screen.getByTestId(ProgressRingTestId.Root);
    expect(ring).toHaveRole("progressbar");
    expect(ring).toHaveAccessibleName("5h rolling");
    expect(ring).toHaveAttribute("aria-valuenow", "64");
  });

  it("clamps and rounds the centered value", () => {
    render(<ProgressRing value={150.4} />);
    expect(screen.getByTestId(ProgressRingTestId.Value)).toHaveTextContent("100");
  });

  it("hides the centered value when showValue is false", () => {
    render(<ProgressRing showValue={false} value={20} />);
    expect(screen.queryByTestId(ProgressRingTestId.Value)).toBeNull();
  });

  it("renders no progressbar role without a label", () => {
    render(<ProgressRing value={20} />);
    expect(screen.getByTestId(ProgressRingTestId.Root)).not.toHaveAttribute("role");
  });
});
