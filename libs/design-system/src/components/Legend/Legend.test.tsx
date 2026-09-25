import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend, LegendTestId } from "./Legend";
import type { LegendItem } from "./Legend";

const ITEMS: LegendItem[] = [
  { state: "working", label: "Working", count: 6 },
  { state: "thinking", label: "Thinking", count: 2 },
  { state: "blocked", label: "Blocked", count: 1 },
  { state: "idle", label: "Idle", count: 9 },
];

const rowMatcher = new RegExp(`^${LegendTestId.Row}-`);

describe("Legend", () => {
  it("renders one row per item", () => {
    render(<Legend items={ITEMS} />);
    expect(screen.getAllByTestId(rowMatcher)).toHaveLength(4);
  });

  it("renders the label and count for a row", () => {
    render(<Legend items={ITEMS} />);
    expect(screen.getByTestId(`${LegendTestId.Row}-working`)).toHaveTextContent("Working");
    expect(screen.getByTestId(`${LegendTestId.Row}-working`)).toHaveTextContent("6");
  });

  it("renders an empty grid for an empty item list", () => {
    render(<Legend items={[]} />);
    expect(screen.queryAllByTestId(rowMatcher)).toHaveLength(0);
  });
});
