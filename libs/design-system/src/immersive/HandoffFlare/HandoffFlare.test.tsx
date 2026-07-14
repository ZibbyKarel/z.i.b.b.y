import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetImmersiveCss } from "../immersive.css";
import { HandoffFlare, HandoffFlareTestId } from "./HandoffFlare";

afterEach(() => {
  resetImmersiveCss();
  vi.useRealTimers();
});

const FROM = { x: 40, y: 40 };
const TO = { x: 260, y: 200 };

describe("HandoffFlare", () => {
  it("renders the launch ring, three comet dots, and the impact burst", () => {
    render(<HandoffFlare from={FROM} to={TO} />);
    expect(screen.getByTestId(HandoffFlareTestId.Launch)).toBeInTheDocument();
    expect(screen.getAllByTestId(new RegExp(`^${HandoffFlareTestId.Comet}-\\d$`))).toHaveLength(3);
    expect(screen.getByTestId(HandoffFlareTestId.BurstCore)).toBeInTheDocument();
    expect(screen.getByTestId(HandoffFlareTestId.BurstRing)).toBeInTheDocument();
  });

  it("fires onDone once its lifetime (durationMs + 200ms) elapses", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<HandoffFlare durationMs={1300} from={FROM} onDone={onDone} to={TO} />);

    vi.advanceTimersByTime(1499);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("applies the default handoff color to the launch ring when `color` is omitted", () => {
    render(<HandoffFlare from={FROM} to={TO} />);
    expect(screen.getByTestId(HandoffFlareTestId.Launch)).toHaveStyle({
      border: "1.5px solid #ffe066",
    });
  });
});
