import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricStrip, MetricStripTestId } from "./MetricStrip";
import type { MetricStripItem } from "./MetricStrip";

const ITEMS: MetricStripItem[] = [
  { label: "Projects", value: "04" },
  { label: "Open tasks", value: "12", hint: "3 blocked" },
  { label: "Spend today", value: "$18.40" },
];

describe("MetricStrip", () => {
  it("renders one column per item", () => {
    render(<MetricStrip columns={3} items={ITEMS} />);
    expect(screen.getAllByTestId(MetricStripTestId.Label)).toHaveLength(3);
    expect(screen.getAllByTestId(MetricStripTestId.Value)).toHaveLength(3);
  });

  it("renders label and value text", () => {
    render(<MetricStrip columns={3} items={ITEMS} />);
    expect(screen.getByTestId(`${MetricStripTestId.Item}-0`)).toHaveTextContent("Projects");
    expect(screen.getByTestId(`${MetricStripTestId.Item}-0`)).toHaveTextContent("04");
  });

  it("renders the hint only for items that specify one", () => {
    render(<MetricStrip columns={3} items={ITEMS} />);
    expect(screen.getAllByTestId(MetricStripTestId.Hint)).toHaveLength(1);
    expect(screen.getByTestId(MetricStripTestId.Hint)).toHaveTextContent("3 blocked");
  });

  it("supports a 4-column layout", () => {
    render(<MetricStrip columns={4} items={ITEMS} />);
    expect(screen.getByTestId(MetricStripTestId.Root)).toHaveClass("grid-cols-4");
  });

  it("supports a 6-column layout", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: i }));
    render(<MetricStrip columns={6} items={six} />);
    expect(screen.getByTestId(MetricStripTestId.Root)).toHaveClass("grid-cols-6");
    expect(screen.getByTestId(`${MetricStripTestId.Item}-5`)).toBeInTheDocument();
  });

  it("keys a column by its id and renders a node value plus an action", () => {
    render(
      <MetricStrip
        columns={5}
        items={[
          {
            id: "state",
            label: "State",
            value: <strong>Draft</strong>,
            action: <button type="button">Ready</button>,
          },
        ]}
      />,
    );
    expect(screen.getByTestId(MetricStripTestId.Root)).toHaveClass("grid-cols-5");
    const item = screen.getByTestId(`${MetricStripTestId.Item}-state`);
    expect(item).toHaveTextContent("Draft");
    expect(screen.getByTestId(MetricStripTestId.Action)).toHaveTextContent("Ready");
    const row = screen.getByTestId(MetricStripTestId.ValueRow);
    expect(row).toContainElement(screen.getByTestId(MetricStripTestId.Value));
    expect(row).toContainElement(screen.getByTestId(MetricStripTestId.Action));
    expect(row.className).toContain("flex-wrap");
  });

  it("renders no action slot when an item has none", () => {
    render(<MetricStrip columns={3} items={ITEMS} />);
    expect(screen.queryByTestId(MetricStripTestId.Action)).toBeNull();
  });
});
