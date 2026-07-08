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

/** One discrete pointer activation: press + release before the hold completes. */
function shortPress(el: HTMLElement) {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
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

  it("defaults to the md footprint and applies the sm scale when asked", () => {
    const { rerender } = render(<HoldButton label="Podržet" />);
    // md (default) — the standalone approval footprint.
    expect(screen.getByTestId(HoldButtonTestId.Root)).toHaveClass("px-[18px]", "py-[11px]");
    // sm — matches Button size="sm" (px-3 py-1.5 text-sm) so it sits flush beside
    // its peers in dense chrome like the top bar.
    rerender(<HoldButton label="Podržet" size="sm" />);
    expect(screen.getByTestId(HoldButtonTestId.Root)).toHaveClass("px-3", "py-1.5", "text-sm");
  });

  it("does not start a hold when disabled", () => {
    mockFrames(1000);
    const onConfirm = vi.fn();
    render(<HoldButton disabled label="Podržet" onConfirm={onConfirm} />);
    fireEvent.pointerDown(screen.getByTestId(HoldButtonTestId.Root));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe("discrete arm → confirm path (Fáze 17.2)", () => {
    it("arms on an early release instead of confirming (no silent rollback)", () => {
      mockFrames(100);
      const onConfirm = vi.fn();
      render(<HoldButton armedLabel="Stiskni znovu" label="Podržet" onConfirm={onConfirm} />);
      shortPress(screen.getByTestId(HoldButtonTestId.Root));
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toHaveTextContent("Stiskni znovu");
    });

    it("confirms on the second discrete activation while armed", () => {
      mockFrames(100);
      const onConfirm = vi.fn();
      render(
        <HoldButton
          armedLabel="Stiskni znovu"
          doneLabel="Schváleno"
          label="Podržet"
          onConfirm={onConfirm}
        />,
      );
      const root = screen.getByTestId(HoldButtonTestId.Root);
      shortPress(root);
      shortPress(root);
      expect(onConfirm).toHaveBeenCalledOnce();
      expect(root).toHaveTextContent("Schváleno");
      expect(screen.queryByTestId(HoldButtonTestId.ArmedLabel)).not.toBeInTheDocument();
    });

    it("arms and confirms via the keyboard (short Space/Enter presses)", () => {
      mockFrames(100);
      const onConfirm = vi.fn();
      render(<HoldButton armedLabel="Stiskni znovu" label="Podržet" onConfirm={onConfirm} />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      fireEvent.keyDown(root, { key: " " });
      fireEvent.keyUp(root, { key: " " });
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toBeInTheDocument();
      fireEvent.keyDown(root, { key: "Enter" });
      fireEvent.keyUp(root, { key: "Enter" });
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("disarms on Escape — the next single activation arms again, not confirms", () => {
      mockFrames(100);
      const onConfirm = vi.fn();
      render(<HoldButton label="Podržet" onConfirm={onConfirm} />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      shortPress(root);
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toBeInTheDocument();
      fireEvent.keyDown(root, { key: "Escape" });
      expect(screen.queryByTestId(HoldButtonTestId.ArmedLabel)).not.toBeInTheDocument();
      expect(root).toHaveTextContent("Podržet");
      shortPress(root);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toBeInTheDocument();
    });

    it("disarms on blur", () => {
      mockFrames(100);
      render(<HoldButton label="Podržet" />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      shortPress(root);
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toBeInTheDocument();
      fireEvent.blur(root);
      expect(screen.queryByTestId(HoldButtonTestId.ArmedLabel)).not.toBeInTheDocument();
    });

    it("does NOT arm on a cancelled gesture (pointer leaves the button)", () => {
      mockFrames(100);
      const onConfirm = vi.fn();
      render(<HoldButton label="Podržet" onConfirm={onConfirm} />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      fireEvent.pointerDown(root);
      fireEvent.pointerLeave(root);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByTestId(HoldButtonTestId.ArmedLabel)).not.toBeInTheDocument();
    });

    it("a full hold still confirms directly while armed", () => {
      // First press is short (arms); the mock's single frame is consumed by it,
      // so re-mock a completing frame for the second, held press.
      mockFrames(100);
      const onConfirm = vi.fn();
      render(<HoldButton label="Podržet" onConfirm={onConfirm} />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      shortPress(root);
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toBeInTheDocument();
      vi.restoreAllMocks();
      mockFrames(1000);
      fireEvent.pointerDown(root);
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("announces the label swap politely and defaults the armed label in English", () => {
      mockFrames(100);
      render(<HoldButton label="Podržet" />);
      const root = screen.getByTestId(HoldButtonTestId.Root);
      expect(screen.getByTestId(HoldButtonTestId.Label)).toHaveAttribute("aria-live", "polite");
      shortPress(root);
      expect(screen.getByTestId(HoldButtonTestId.ArmedLabel)).toHaveTextContent(
        "Press again to confirm",
      );
      // Descriptive text, not a toggle — no aria-pressed.
      expect(root).not.toHaveAttribute("aria-pressed");
      expect(root).toHaveAccessibleName("Press again to confirm");
    });
  });
});
