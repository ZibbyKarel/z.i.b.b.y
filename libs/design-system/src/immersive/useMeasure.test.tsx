import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useMeasure } from "./useMeasure";

function Probe() {
  const [ref, { w, h }] = useMeasure();
  return (
    <div data-testid="probe" ref={ref}>
      {w}x{h}
    </div>
  );
}

describe("useMeasure", () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("renders with the default 1200x720 size under jsdom (no real layout)", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("1200x720");
  });

  it("does not throw when ResizeObserver is absent", () => {
    // @ts-expect-error -- deliberately removing the global to exercise the guard
    delete globalThis.ResizeObserver;
    expect(() => render(<Probe />)).not.toThrow();
    expect(screen.getByTestId("probe")).toHaveTextContent("1200x720");
  });
});
