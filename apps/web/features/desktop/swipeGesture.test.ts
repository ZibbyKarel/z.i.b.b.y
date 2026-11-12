import { describe, expect, it } from "vitest";
import { type SwipeDirection, createSwipeDetector } from "./swipeGesture";

type Ev = { deltaX: number; deltaY: number; ctrlKey: boolean; timeStamp: number };

/** Feed `count` wheel events 16 ms apart starting at `start`; collect non-null results. */
function feed(
  detect: ReturnType<typeof createSwipeDetector>,
  count: number,
  partial: Partial<Ev>,
  start = 0,
): SwipeDirection[] {
  const out: SwipeDirection[] = [];
  for (let i = 0; i < count; i++) {
    const r = detect({
      deltaX: 0,
      deltaY: 0,
      ctrlKey: false,
      timeStamp: start + i * 16,
      ...partial,
    });
    if (r) out.push(r);
  }
  return out;
}

describe("createSwipeDetector (todo-6)", () => {
  it("fires back exactly once for a leftward-delta gesture", () => {
    expect(feed(createSwipeDetector(), 10, { deltaX: -15 })).toEqual(["back"]);
  });

  it("fires forward exactly once for a rightward-delta gesture", () => {
    expect(feed(createSwipeDetector(), 10, { deltaX: 15 })).toEqual(["forward"]);
  });

  it("ignores vertical-dominant scrolling with horizontal drift", () => {
    expect(feed(createSwipeDetector(), 20, { deltaX: -15, deltaY: -40 })).toEqual([]);
  });

  it("ignores pinch-zoom (ctrlKey)", () => {
    expect(feed(createSwipeDetector(), 20, { deltaX: -15, ctrlKey: true })).toEqual([]);
  });

  it("fires again for a second gesture after a gap", () => {
    const d = createSwipeDetector();
    expect([...feed(d, 10, { deltaX: -15 }), ...feed(d, 10, { deltaX: -15 }, 460)]).toEqual([
      "back",
      "back",
    ]);
  });

  it("does not fire below the threshold", () => {
    expect(feed(createSwipeDetector(), 10, { deltaX: -10 })).toEqual([]);
  });
});
