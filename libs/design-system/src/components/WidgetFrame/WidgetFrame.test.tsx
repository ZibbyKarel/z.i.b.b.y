import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { WidgetFrame, WidgetFrameTestId } from "./WidgetFrame";

const CORNERS = ["nw", "ne", "sw", "se"] as const;
const resizeId = (c: string) => `${WidgetFrameTestId.Resize}-${c}`;

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
    for (const id of [WidgetFrameTestId.Remove, WidgetFrameTestId.Size, WidgetFrameTestId.Empty])
      expect(screen.queryByTestId(id)).toBeNull();
    for (const c of CORNERS) expect(screen.queryByTestId(resizeId(c))).toBeNull();
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
        resizeLabel="Resize"
        sizeLabel="4 × 6"
      />,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Size)).toHaveTextContent("4 × 6");
    expect(screen.getByTestId(WidgetFrameTestId.Empty)).toHaveTextContent("Nothing here");
    expect(screen.getByTestId(WidgetFrameTestId.Body)).toBeVisible();
    // no collapse caret in edit mode
    expect(screen.queryByTestId(WidgetFrameTestId.Collapse)).toBeNull();
    fireEvent.pointerDown(screen.getByTestId(WidgetFrameTestId.Header));
    for (const c of CORNERS) {
      const handle = screen.getByTestId(resizeId(c));
      expect(handle).toHaveRole("separator");
      expect(handle).toHaveAccessibleName("Resize");
    }
    fireEvent.pointerDown(screen.getByTestId(resizeId("nw")));
    expect(onMove).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(expect.anything(), "nw");
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

  /** Stubs root border (offset-client) and header/content rect heights; returns a restore fn. */
  const stubHeights = (header: number, content: number) => {
    const off = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === WidgetFrameTestId.Root ? 100 : 0;
    });
    const cli = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === WidgetFrameTestId.Root ? 98 : 0;
    });
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const id = this.dataset.testid;
        const height =
          id === WidgetFrameTestId.Header ? header : id === WidgetFrameTestId.Content ? content : 0;
        return { height } as DOMRect;
      });
    return () => {
      off.mockRestore();
      cli.mockRestore();
      rect.mockRestore();
    };
  };

  it("reports its natural height on mount, ceiling sub-pixel heights", () => {
    const restore = stubHeights(30.4, 49.5);
    const onNaturalHeight = vi.fn();
    render(<WidgetFrame label="X" onNaturalHeight={onNaturalHeight} />);
    expect(onNaturalHeight).toHaveBeenCalledWith(2 + 31 + 50);
    restore();
  });

  it("does not report while the open content measures 0px", () => {
    const restore = stubHeights(30, 0);
    const onNaturalHeight = vi.fn();
    render(<WidgetFrame label="X" onNaturalHeight={onNaturalHeight} />);
    expect(onNaturalHeight).not.toHaveBeenCalled();
    restore();
  });

  it("reports header-only height when closed (empty)", () => {
    const restore = stubHeights(30, 0);
    const onNaturalHeight = vi.fn();
    render(<WidgetFrame empty label="X" onNaturalHeight={onNaturalHeight} />);
    expect(onNaturalHeight).toHaveBeenCalledWith(32);
    restore();
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

  it("renders a loader with role=status and the loadingLabel when loading", () => {
    render(<WidgetFrame loading label="X" loadingLabel="Loading…" />);
    const loader = screen.getByTestId(WidgetFrameTestId.Loading);
    expect(loader).toHaveRole("status");
    expect(loader).toHaveAccessibleName("Loading…");
  });

  it("renders no loader when not loading", () => {
    render(<WidgetFrame label="X" />);
    expect(screen.queryByTestId(WidgetFrameTestId.Loading)).toBeNull();
  });
});
