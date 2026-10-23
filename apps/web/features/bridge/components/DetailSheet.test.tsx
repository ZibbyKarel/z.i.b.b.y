import { WidgetFrameTestId } from "@zibby/design-system";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { BridgeSelection } from "../widgets/registry";
import { DetailSheet } from "./DetailSheet";

// The real sheets pull in queries / mutations — this test is about anchoring + keys.
vi.mock("./sheets/IssueSheet", () => ({
  IssueSheet: (p: {
    id: string;
    anchor: { side: string; left: number; width: number; eT: number; eH: number };
  }) => <div data-anchor={JSON.stringify(p.anchor)} data-id={p.id} data-testid="issue-sheet" />,
}));
vi.mock("./sheets/TaskSheet", () => ({ TaskSheet: () => null }));
vi.mock("./sheets/PrSheet", () => ({ PrSheet: () => null }));

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const ROWS = ["a", "b", "c"];

function Harness({
  initial,
  onSideChange,
}: {
  initial?: string;
  onSideChange?: (s: "left" | "right") => void;
}) {
  const [sel, setSel] = useState<BridgeSelection | null>(
    initial ? { kind: "issue", id: initial, widgetId: "w1", key: `w1:${initial}` } : null,
  );
  return (
    <div data-testid="root">
      <section data-testid={WidgetFrameTestId.Root}>
        {ROWS.map((r) => (
          <div
            data-rk={`w1:${r}`}
            data-testid={`row-${r}`}
            key={r}
            onClick={() => setSel({ kind: "issue", id: r, widgetId: "w1", key: `w1:${r}` })}
          />
        ))}
      </section>
      <section data-testid={WidgetFrameTestId.Root}>
        <div data-rk="w2:z" data-testid="row-z" />
      </section>
      <textarea data-testid="ta" />
      <DetailSheet onClose={() => setSel(null)} onSideChange={onSideChange} selection={sel} />
    </div>
  );
}

function stubRects() {
  screen.getByTestId("root").getBoundingClientRect = () => rect(0, 100, 1200, 700);
  screen.getByTestId("row-a").getBoundingClientRect = () => rect(10, 150, 300, 30);
  // 1190 - 1000 = 190 free on the right -> opens left
  screen.getByTestId("row-b").getBoundingClientRect = () => rect(700, 200, 490, 30);
}

describe("DetailSheet", () => {
  it("reports the side the sheet opened to", () => {
    const onSideChange = vi.fn();
    render(<Harness onSideChange={onSideChange} />);
    stubRects();
    fireEvent.click(screen.getByTestId("row-a"));
    expect(onSideChange).toHaveBeenLastCalledWith("right");
    fireEvent.click(screen.getByTestId("row-b"));
    expect(onSideChange).toHaveBeenLastCalledWith("left");
  });

  it("anchors right of a row with room, flush with its edge", async () => {
    render(<Harness />);
    stubRects();
    fireEvent.click(screen.getByTestId("row-a"));
    const anchor = JSON.parse(screen.getByTestId("issue-sheet").dataset.anchor ?? "{}");
    expect(anchor).toMatchObject({
      side: "r",
      left: 309,
      width: 891,
      top: 0,
      height: 700,
      eL: -2,
      eH: 30,
    });
  });

  it("anchors left when the row leaves less than 460px on the right", () => {
    render(<Harness />);
    stubRects();
    fireEvent.click(screen.getByTestId("row-b"));
    const anchor = JSON.parse(screen.getByTestId("issue-sheet").dataset.anchor ?? "{}");
    expect(anchor).toMatchObject({ side: "l", left: 0, width: 701, eL: 699 });
  });

  it("ArrowDown / ArrowUp open the next / previous row, within the widget only", () => {
    render(<Harness initial="a" />);
    stubRects();
    fireEvent.click(screen.getByTestId("row-a"));
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("a");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("b");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("c");
    fireEvent.keyDown(window, { key: "ArrowDown" }); // end of the widget: stays (never the next widget's row)
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("c");
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("b");
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("a");
    // J / K no longer navigate
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("a");
  });

  it("ignores arrows while typing in a textarea, and does nothing with no selection", () => {
    render(<Harness />);
    stubRects();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.queryByTestId("issue-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("row-a"));
    fireEvent.keyDown(screen.getByTestId("ta"), { key: "ArrowDown" });
    expect(screen.getByTestId("issue-sheet").dataset.id).toBe("a");
  });

  it("re-measures when the wrapper resizes", async () => {
    render(<Harness />);
    stubRects();
    fireEvent.click(screen.getByTestId("row-a"));
    screen.getByTestId("row-a").getBoundingClientRect = () => rect(10, 160, 300, 30);
    await act(async () => {
      screen.getByTestId("row-a").appendChild(document.createElement("i")); // MutationObserver tick
      await Promise.resolve();
    });
    const anchor = JSON.parse(screen.getByTestId("issue-sheet").dataset.anchor ?? "{}");
    expect(anchor.eT).toBe(160 - 100 - 4);
  });
});
