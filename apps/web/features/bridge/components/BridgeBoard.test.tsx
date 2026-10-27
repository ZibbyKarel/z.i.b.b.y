import { WidgetFrameTestId } from "@zibby/design-system";
import { act, fireEvent } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeState } from "../state/useBridgeState";
import type { BridgeWidgetProps } from "../widgets/registry";
import { BridgeBoard } from "./BridgeBoard";

const h = vi.hoisted(() => ({ setLoading: null as unknown as (loading: boolean) => void }));

vi.mock("@zibby/design-system", async (orig) => {
  const actual = await orig<typeof import("@zibby/design-system")>();
  return {
    ...actual,
    WidgetBoard: ({
      onMeasure,
      children,
    }: {
      onMeasure: (w: number) => void;
      children: unknown;
    }) => {
      useEffect(() => onMeasure(1200), [onMeasure]);
      return <div>{children as never}</div>;
    },
  };
});

vi.mock("../widgets/registry", () => ({
  WIDGETS: {
    prs: {
      labelKey: "bridge.widget.prs.label",
      Component: ({ onEmptyChange, onCountChange }: BridgeWidgetProps) => {
        const [loading, setLoading] = useState(true);
        h.setLoading = setLoading;
        useEffect(() => onEmptyChange(false), [onEmptyChange]);
        // Same count/you/aside every time; only `loading` differs.
        useEffect(() => onCountChange?.({ count: 1, you: 0, loading }), [loading, onCountChange]);
        return null;
      },
    },
  },
}));

const state = {
  layout: [{ id: "prs", type: "prs", x: 0, y: 0, w: 6, h: 4 }],
  editing: false,
  collapsed: {},
  draggingId: null,
  selection: null,
} as unknown as BridgeState;

describe("BridgeBoard", () => {
  it("drops the loader when only `loading` flips true to false", () => {
    renderWithProviders(<BridgeBoard density="comfort" state={state} />);
    expect(screen.getByTestId(WidgetFrameTestId.Loading)).toBeInTheDocument();
    act(() => h.setLoading(false));
    expect(screen.queryByTestId(WidgetFrameTestId.Loading)).toBeNull();
  });

  it("starts a resize from the pressed corner", () => {
    // jsdom has no PointerEvent; MouseEvent carries the button/clientX the handler reads.
    vi.stubGlobal("PointerEvent", MouseEvent);
    const layout = [{ id: "prs", type: "prs", x: 0, y: 0, w: 6, h: 4 }];
    const resize = vi.fn();
    const editState = {
      ...state,
      editing: true,
      layout,
      layoutRef: { current: layout },
      beginDrag: vi.fn(),
      endDrag: vi.fn(),
      resize,
    } as unknown as BridgeState;
    renderWithProviders(<BridgeBoard density="comfort" state={editState} />);
    fireEvent.pointerDown(screen.getByTestId(`${WidgetFrameTestId.Resize}-nw`), { button: 0 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 100 });
    expect(resize).toHaveBeenCalledWith(
      "prs",
      { x: 0, y: 0, w: 6, h: 4 },
      expect.any(Number),
      expect.any(Number),
      "nw",
    );
    fireEvent.pointerUp(window);
    vi.unstubAllGlobals();
  });
});
