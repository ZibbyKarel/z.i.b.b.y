import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StateTone } from "../../stateTone";
import { CellStrip, CellStripTestId } from "./CellStrip";

const CELLS: StateTone[] = ["working", "working", "thinking", "blocked", "idle", "done"];

describe("CellStrip", () => {
  it("renders one 9px dot per cell", () => {
    render(<CellStrip cells={CELLS} />);
    const dots = screen.getAllByTestId(CellStripTestId.Cell);
    expect(dots).toHaveLength(CELLS.length);
    for (const dot of dots) {
      expect(dot.style.width).toBe("9px");
      expect(dot.style.height).toBe("9px");
    }
  });

  it("renders no overflow marker when every cell fits", () => {
    render(<CellStrip cells={CELLS} />);
    expect(screen.queryByTestId(CellStripTestId.Overflow)).toBeNull();
  });

  it("caps at max and collapses the remainder into +N", () => {
    render(<CellStrip cells={CELLS} max={4} />);
    expect(screen.getAllByTestId(CellStripTestId.Cell)).toHaveLength(4);
    expect(screen.getByTestId(CellStripTestId.Overflow)).toHaveTextContent("+2");
  });

  it("renders no overflow marker when max meets or exceeds the cell count", () => {
    render(<CellStrip cells={CELLS} max={CELLS.length} />);
    expect(screen.queryByTestId(CellStripTestId.Overflow)).toBeNull();
  });

  it("renders an empty strip for an empty cells array", () => {
    render(<CellStrip cells={[]} />);
    expect(screen.queryAllByTestId(CellStripTestId.Cell)).toHaveLength(0);
    expect(screen.queryByTestId(CellStripTestId.Overflow)).toBeNull();
  });

  it("forwards a ref and arbitrary props to the root", () => {
    let node: HTMLElement | null = null;
    render(
      <CellStrip
        aria-label="department cells"
        cells={CELLS}
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).toBeInstanceOf(HTMLSpanElement);
    expect(screen.getByTestId(CellStripTestId.Root)).toHaveAttribute(
      "aria-label",
      "department cells",
    );
  });
});
