export type SwipeDirection = "back" | "forward";

export const SWIPE_THRESHOLD_PX = 120;
export const GESTURE_GAP_MS = 200;

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  timeStamp: number;
}

/**
 * Turns a stream of wheel events into at most one back/forward per trackpad gesture.
 * A gesture ends after GESTURE_GAP_MS without wheel events (momentum events keep it alive,
 * so they cannot trigger a second navigation). Positive deltaX = forward, negative = back.
 */
export function createSwipeDetector(): (e: WheelSample) => SwipeDirection | null {
  let acc = 0;
  let last = Number.NEGATIVE_INFINITY;
  let fired = false;
  return (e) => {
    if (e.timeStamp - last > GESTURE_GAP_MS) {
      acc = 0;
      fired = false;
    }
    last = e.timeStamp;
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX) || fired) return null;
    acc += e.deltaX;
    if (Math.abs(acc) < SWIPE_THRESHOLD_PX) return null;
    fired = true;
    return acc > 0 ? "forward" : "back";
  };
}
