import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline, SparklineTestId } from "./Sparkline";

describe("Sparkline", () => {
  it("renders area and line polylines for data", () => {
    render(<Sparkline data={[4, 6, 9, 7, 12]} />);
    expect(screen.getByTestId(SparklineTestId.Area)).toBeInTheDocument();
    expect(screen.getByTestId(SparklineTestId.Line)).toBeInTheDocument();
  });

  it("renders nothing for empty data", () => {
    render(<Sparkline data={[]} />);
    expect(screen.queryByTestId(SparklineTestId.Root)).toBeNull();
  });
});
