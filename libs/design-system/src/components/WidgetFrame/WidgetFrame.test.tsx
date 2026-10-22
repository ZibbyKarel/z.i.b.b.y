import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { WidgetFrame, WidgetFrameTestId } from "./WidgetFrame";

describe("WidgetFrame", () => {
  it("renders header parts and body", () => {
    render(
      <WidgetFrame aside="ALL CLEAR" count="04" label="ISSUES" you="02 YOU">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Label)).toHaveTextContent("ISSUES");
    expect(screen.getByTestId(WidgetFrameTestId.Count)).toHaveTextContent("04");
    expect(screen.getByTestId(WidgetFrameTestId.You)).toHaveTextContent("02 YOU");
    expect(screen.getByTestId(WidgetFrameTestId.Aside)).toHaveTextContent("ALL CLEAR");
    expect(screen.getByText("rows")).toBeVisible();
  });

  it("shows the caret only when a toggle handler is given and toggles", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<WidgetFrame label="X" />);
    expect(screen.queryByTestId(WidgetFrameTestId.Collapse)).toBeNull();
    rerender(<WidgetFrame label="X" onToggleCollapse={onToggle} />);
    const caret = screen.getByTestId(WidgetFrameTestId.Collapse);
    expect(caret).toHaveTextContent("▾");
    await userEvent.click(caret);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<WidgetFrame collapsed label="X" onToggleCollapse={onToggle} />);
    expect(screen.getByTestId(WidgetFrameTestId.Collapse)).toHaveTextContent("▸");
  });

  it("hides the body (but keeps it mounted) when collapsed or empty outside edit mode", () => {
    const { rerender } = render(
      <WidgetFrame collapsed label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Body)).not.toBeVisible();
    expect(screen.getByText("rows")).toBeInTheDocument();
    rerender(
      <WidgetFrame empty label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Body)).not.toBeVisible();
    expect(screen.queryByTestId(WidgetFrameTestId.Collapse)).toBeNull();
  });

  it("has no edit affordances outside edit mode", () => {
    render(<WidgetFrame label="X" onRemove={vi.fn()} sizeLabel="4 × 6" />);
    for (const id of [
      WidgetFrameTestId.Remove,
      WidgetFrameTestId.Size,
      WidgetFrameTestId.Resize,
      WidgetFrameTestId.Empty,
    ])
      expect(screen.queryByTestId(id)).toBeNull();
  });

  it("shows edit affordances, the dashed empty box and drag callbacks in edit mode", async () => {
    const onMove = vi.fn();
    const onResize = vi.fn();
    const onRemove = vi.fn();
    render(
      <WidgetFrame
        editing
        empty
        emptyText="Nothing here"
        label="X"
        onMovePointerDown={onMove}
        onRemove={onRemove}
        onResizePointerDown={onResize}
        onToggleCollapse={vi.fn()}
        sizeLabel="4 × 6"
      />,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Size)).toHaveTextContent("4 × 6");
    expect(screen.getByTestId(WidgetFrameTestId.Empty)).toHaveTextContent("Nothing here");
    expect(screen.getByTestId(WidgetFrameTestId.Body)).toBeVisible();
    // no collapse caret in edit mode
    expect(screen.queryByTestId(WidgetFrameTestId.Collapse)).toBeNull();
    fireEvent.pointerDown(screen.getByTestId(WidgetFrameTestId.Header));
    fireEvent.pointerDown(screen.getByTestId(WidgetFrameTestId.Resize));
    expect(onMove).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByTestId(WidgetFrameTestId.Remove));
    expect(onRemove).toHaveBeenCalledOnce();
    // the × must not start a move drag
    expect(onMove).toHaveBeenCalledOnce();
  });

  it("marks dragging with an ink border and passes geometry through", () => {
    render(<WidgetFrame dragging editing label="X" style={{ left: 10, top: 20 }} />);
    const root = screen.getByTestId(WidgetFrameTestId.Root);
    expect(root).toHaveClass("border-ink");
    expect(root).toHaveStyle({ left: "10px", top: "20px" });
  });

  it("reports its natural height on mount", () => {
    const heights: Record<string, [number, number]> = {
      [WidgetFrameTestId.Root]: [100, 98],
      [WidgetFrameTestId.Header]: [30, 0],
      [WidgetFrameTestId.Content]: [50, 0],
    };
    const pick = (el: HTMLElement, i: 0 | 1) => heights[el.dataset.testid ?? ""]?.[i] ?? 0;
    const off = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return pick(this, 0);
    });
    const cli = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return pick(this, 1);
    });
    const onNaturalHeight = vi.fn();
    render(<WidgetFrame label="X" onNaturalHeight={onNaturalHeight} />);
    expect(onNaturalHeight).toHaveBeenCalledWith(82);
    off.mockRestore();
    cli.mockRestore();
  });

  it("wraps children in the content wrapper", () => {
    render(
      <WidgetFrame label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Content)).toContainElement(
      screen.getByText("rows"),
    );
  });
});
