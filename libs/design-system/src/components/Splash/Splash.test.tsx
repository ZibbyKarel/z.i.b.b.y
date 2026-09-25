import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import {
  SPLASH_EXIT_MS,
  SPLASH_REVEAL_MS,
  SPLASH_WALK_MS,
  Splash,
  SplashTestId,
} from "./Splash";

describe("Splash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in the walk phase, wordmark hidden", () => {
    render(<Splash ready={false} />);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "walk");
    expect(screen.getByTestId(SplashTestId.Wordmark)).toHaveStyle({ opacity: "0" });
  });

  it("advances walk -> reveal -> settled on its own timers", () => {
    render(<Splash ready={false} />);
    vi.advanceTimersByTime(SPLASH_WALK_MS);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "reveal");
    expect(screen.getByTestId(SplashTestId.Wordmark)).toHaveStyle({ opacity: "1" });

    vi.advanceTimersByTime(SPLASH_REVEAL_MS);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "settled");
  });

  it("does not exit before ready, even once the choreography settles", () => {
    render(<Splash ready={false} />);
    vi.advanceTimersByTime(SPLASH_WALK_MS + SPLASH_REVEAL_MS + 5000);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "settled");
  });

  it("exits and calls onDone once settled AND ready, setting pointer-events none immediately", () => {
    const onDone = vi.fn();
    const { rerender } = render(<Splash onDone={onDone} ready={false} />);
    vi.advanceTimersByTime(SPLASH_WALK_MS + SPLASH_REVEAL_MS);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "settled");

    rerender(<Splash ready onDone={onDone} />);
    expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "exit");
    expect(screen.getByTestId(SplashTestId.Root)).toHaveStyle({ pointerEvents: "none" });
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SPLASH_EXIT_MS);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("unmounts (renders nothing) once onDone has fired, so it never swallows clicks", () => {
    const { rerender } = render(<Splash ready />);
    vi.advanceTimersByTime(SPLASH_WALK_MS + SPLASH_REVEAL_MS + SPLASH_EXIT_MS);
    rerender(<Splash ready />);
    expect(screen.queryByTestId(SplashTestId.Root)).toBeNull();
  });

  it("skips the choreography under reduced motion and fades out instantly once ready", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const onDone = vi.fn();
      const { rerender } = render(<Splash onDone={onDone} ready={false} />);
      expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "settled");
      expect(screen.getByTestId(SplashTestId.Wordmark)).toHaveStyle({ opacity: "1" });

      rerender(<Splash ready onDone={onDone} />);
      expect(screen.getByTestId(SplashTestId.Root)).toHaveAttribute("data-phase", "exit");
      vi.advanceTimersByTime(0);
      expect(onDone).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a custom wordmark, tagline and status", () => {
    render(<Splash ready={false} status="Custom status" tagline="Custom tagline" wordmark="ACME" />);
    vi.advanceTimersByTime(SPLASH_WALK_MS);
    expect(screen.getByTestId(SplashTestId.Wordmark)).toHaveTextContent("ACME");
    expect(screen.getByTestId(SplashTestId.Tagline)).toHaveTextContent("Custom tagline");
    expect(screen.getByTestId(SplashTestId.Status)).toHaveTextContent("Custom status");
  });

  it("renders as a status role with an accessible label", () => {
    render(<Splash ready={false} status="Booting" />);
    const el = screen.getByTestId(SplashTestId.Root);
    expect(el).toHaveRole("status");
    expect(el).toHaveAccessibleName("Booting");
  });
});
