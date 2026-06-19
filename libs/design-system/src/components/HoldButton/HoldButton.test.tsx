import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoldButton, HoldButtonTestId } from "./HoldButton";

/**
 * Drives the rAF-based hold loop deterministically: the first scheduled frame
 * runs synchronously at `frameTime` ms after the hold started; later frames
 * are parked so an unfinished hold never recurses.
 */
function mockFrames(frameTime: number) {
  let now = 0;
  let firstFrame = true;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    if (firstFrame) {
      firstFrame = false;
      now = frameTime;
      cb(now);
    }
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
}

describe("HoldButton", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the idle label", () => {
    render(<HoldButton label="Podržet pro schválení" />);
    expect(screen.getByTestId(HoldButtonTestId.Root)).toHaveAccessibleName("Podržet pro schválení");
  });

  it("confirms after a full hold and switches to the done label", () => {
    mockFrames(1000);
    const onConfirm = vi.fn();
    render(<HoldButton doneLabel="Schváleno" label="Podržet" onConfirm={onConfirm} />);
    fireEvent.pointerDown(screen.getByTestId(HoldButtonTestId.Root));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByTestId(HoldButtonTestId.Root)).toHaveTextContent("Schváleno");
    expect(screen.getByTestId(HoldButtonTestId.Icon)).toBeInTheDocument();
  });

  it("does not confirm when released early", () => {
    mockFrames(100);
    const onConfirm = vi.fn();
    render(<HoldButton label="Podržet" onConfirm={onConfirm} />);
    const root = screen.getByTestId(HoldButtonTestId.Root);
    fireEvent.pointerDown(root);
    fireEvent.pointerUp(root);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(root).toHaveTextContent("Podržet");
  });

  it("does not start a hold when disabled", () => {
    mockFrames(1000);
    const onConfirm = vi.fn();
    render(<HoldButton disabled label="Podržet" onConfirm={onConfirm} />);
    fireEvent.pointerDown(screen.getByTestId(HoldButtonTestId.Root));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
