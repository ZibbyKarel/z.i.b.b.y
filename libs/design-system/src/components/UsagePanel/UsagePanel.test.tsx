import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsagePanel, UsagePanelTestId } from "./UsagePanel";

const ITEMS = [
  { label: "5H", value: 39, resetsIn: "2h 22m" },
  { label: "WEEK", value: 37, resetsIn: "3d 6h" },
];

describe("UsagePanel", () => {
  it("renders each window with its percentage, label and reset countdown", () => {
    render(<UsagePanel items={ITEMS} />);
    const values = screen.getAllByTestId(UsagePanelTestId.Value);
    expect(values.map((v) => v.textContent)).toEqual(["39%", "37%"]);
    const labels = screen.getAllByTestId(UsagePanelTestId.Label);
    expect(labels.map((l) => l.textContent)).toEqual(["5H", "WEEK"]);
    const resets = screen.getAllByTestId(UsagePanelTestId.Reset);
    expect(resets.map((r) => r.textContent)).toEqual(["−2h 22m", "−3d 6h"]);
  });

  it("splits the windows with a hairline divider", () => {
    render(<UsagePanel items={ITEMS} />);
    expect(screen.getAllByTestId(UsagePanelTestId.Divider)).toHaveLength(1);
  });

  it("exposes each ring as an ARIA meter", () => {
    render(<UsagePanel items={ITEMS} />);
    const ring = screen.getAllByTestId(UsagePanelTestId.Ring)[1];
    expect(ring).toHaveRole("meter");
    expect(ring).toHaveAccessibleName("WEEK");
    expect(ring).toHaveAttribute("aria-valuenow", "37");
  });

  it("clamps the value and tints the ring by usage band", () => {
    render(
      <UsagePanel
        items={[
          { label: "A", value: 130 },
          { label: "B", value: 80 },
          { label: "C", value: 10 },
        ]}
      />,
    );
    const fills = screen.getAllByTestId(UsagePanelTestId.Fill);
    expect(fills[0]).toHaveClass("stroke-bad");
    expect(fills[1]).toHaveClass("stroke-warn");
    expect(fills[2]).toHaveClass("stroke-ok");
    expect(screen.getAllByTestId(UsagePanelTestId.Value)[0]).toHaveTextContent("100%");
  });

  it("omits the reset line when no countdown is given", () => {
    render(<UsagePanel items={[{ label: "5H", value: 5 }]} />);
    expect(screen.queryByTestId(UsagePanelTestId.Reset)).toBeNull();
  });
});
