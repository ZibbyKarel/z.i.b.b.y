import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { KpiStrip, KpiStripTestId } from "./KpiStrip";

describe("KpiStrip", () => {
  it("renders KPIs and the optional lead", () => {
    const kpis = [
      { id: "needs", label: "NEEDS YOU", value: "03", tone: "blocked" as const },
      { id: "spend", label: "SPEND TODAY", value: "$1.20", tone: "idle" as const },
    ];
    const { rerender } = render(<KpiStrip kpis={kpis} />);
    expect(screen.queryByTestId(KpiStripTestId.Lead)).toBeNull();
    expect(screen.getByTestId(`${KpiStripTestId.Value}-needs`)).toHaveTextContent("03");
    expect(screen.getByTestId(`${KpiStripTestId.Kpi}-spend`)).toHaveTextContent("SPEND TODAY");
    rerender(<KpiStrip kpis={kpis} lead={<p>Lead</p>} />);
    expect(screen.getByTestId(KpiStripTestId.Lead)).toHaveTextContent("Lead");
  });

  it("wraps lead and counters on narrow widths", () => {
    render(
      <KpiStrip kpis={[{ id: "a", label: "A", value: "1", tone: "idle" }]} lead={<p>Lead</p>} />,
    );
    expect(screen.getByTestId(KpiStripTestId.Root)).toHaveClass("flex-wrap");
    expect(screen.getByTestId(KpiStripTestId.Kpis)).toHaveClass(
      "max-w-full",
      "min-w-0",
      "flex-wrap",
    );
  });
});
