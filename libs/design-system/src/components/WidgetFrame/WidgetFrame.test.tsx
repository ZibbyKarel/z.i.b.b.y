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

  it("hides the body (but keeps it mounted) when collapsed", () => {
    render(
      <WidgetFrame collapsed label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Body)).not.toBeVisible();
    expect(screen.getByText("rows")).toBeInTheDocument();
  });

  it("shows the empty state instead of the (still mounted) children when empty", () => {
    const { rerender } = render(
      <WidgetFrame empty label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Empty)).toBeVisible();
    expect(screen.getByText("rows")).toBeInTheDocument();
    expect(screen.getByText("rows")).not.toBeVisible();
    expect(screen.queryByTestId(WidgetFrameTestId.Collapse)).toBeNull();
    rerender(
      <WidgetFrame configuring empty label="X">
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.queryByTestId(WidgetFrameTestId.Empty)).toBeNull();
    expect(screen.getByText("rows")).toBeVisible();
  });

  it("always renders the corner handles and the remove button; size label only while dragging", async () => {
    const onMove = vi.fn();
    const onResize = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(
      <WidgetFrame
        label="X"
        onMovePointerDown={onMove}
        onRemove={onRemove}
        onResizePointerDown={onResize}
        resizeLabel="Resize"
        sizeLabel="4 × 6"
      />,
    );
    expect(screen.queryByTestId(WidgetFrameTestId.Size)).toBeNull();
    fireEvent.pointerDown(screen.getByTestId(WidgetFrameTestId.Header));
    const names = new Set<string>();
    for (const c of CORNERS) {
      const handle = screen.getByTestId(resizeId(c));
      expect(handle).toHaveRole("separator");
      expect(handle).toHaveAccessibleName(expect.stringMatching(/^Resize \(/));
      names.add(handle.getAttribute("aria-label") ?? "");
      fireEvent.pointerDown(handle);
      expect(onResize).toHaveBeenLastCalledWith(expect.anything(), c);
    }
    expect(names.size).toBe(4);
    expect(screen.getByTestId(resizeId("nw"))).toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(onMove).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByTestId(WidgetFrameTestId.Remove));
    expect(onRemove).toHaveBeenCalledOnce();
    // the × must not start a move drag
    expect(onMove).toHaveBeenCalledOnce();
    rerender(<WidgetFrame dragging label="X" sizeLabel="4 × 6" />);
    expect(screen.getByTestId(WidgetFrameTestId.Size)).toHaveTextContent("4 × 6");
  });

  it("renders a configure toggle reflecting `configuring`, forces the body open, and does not start a move", async () => {
    const onConfigure = vi.fn();
    const onMove = vi.fn();
    const { rerender } = render(
      <WidgetFrame
        empty
        configureLabel="Configure"
        label="X"
        onConfigure={onConfigure}
        onMovePointerDown={onMove}
      >
        <p>rows</p>
      </WidgetFrame>,
    );
    const btn = screen.getByTestId(WidgetFrameTestId.Configure);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAccessibleName("Configure");
    await userEvent.click(btn);
    expect(onConfigure).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
    rerender(
      <WidgetFrame configuring empty label="X" onConfigure={onConfigure}>
        <p>rows</p>
      </WidgetFrame>,
    );
    expect(screen.getByTestId(WidgetFrameTestId.Configure)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(WidgetFrameTestId.Body)).toBeVisible();
  });

  it("renders a sync button only with a handler; disabled while refreshing; no move drag", async () => {
    const onRefresh = vi.fn();
    const onMove = vi.fn();
    const { rerender } = render(<WidgetFrame label="X" />);
    expect(screen.queryByTestId(WidgetFrameTestId.Refresh)).toBeNull();
    rerender(
      <WidgetFrame
        label="X"
        onMovePointerDown={onMove}
        onRefresh={onRefresh}
        refreshLabel="Sync"
      />,
    );
    const btn = screen.getByTestId(WidgetFrameTestId.Refresh);
    expect(btn).toHaveAccessibleName("Sync");
    await userEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
    rerender(<WidgetFrame refreshing label="X" onRefresh={onRefresh} refreshLabel="Sync" />);
    expect(screen.getByTestId(WidgetFrameTestId.Refresh)).toBeDisabled();
  });

  it("marks dragging with an ink border and passes geometry through", () => {
    render(<WidgetFrame dragging label="X" style={{ left: 10, top: 20 }} />);
    const root = screen.getByTestId(WidgetFrameTestId.Root);
    expect(root).toHaveClass("border-ink");
    expect(root).toHaveStyle({ left: "10px", top: "20px" });
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
