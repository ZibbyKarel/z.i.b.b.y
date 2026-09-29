import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress, ProgressTestId, getUsageTone } from "./Progress";

describe("Progress", () => {
  it("exposes a progressbar role when labelled", () => {
    render(<Progress label="5h rolling" value={64} />);
    const bar = screen.getByTestId(ProgressTestId.Root);
    expect(bar).toHaveRole("progressbar");
    expect(bar).toHaveAccessibleName("5h rolling");
    expect(bar).toHaveAttribute("aria-valuenow", "64");
  });

  it("clamps values to 0–100", () => {
    render(<Progress label="over" value={150} />);
    expect(screen.getByTestId(ProgressTestId.Root)).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders no progressbar role without a label", () => {
    render(<Progress value={20} />);
    expect(screen.getByTestId(ProgressTestId.Root)).not.toHaveAttribute("role");
  });

  it("omits aria-valuenow when indeterminate", () => {
    render(<Progress indeterminate label="loading" />);
    const bar = screen.getByTestId(ProgressTestId.Root);
    expect(bar).toHaveRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("animates the fill segment instead of sizing it by value", () => {
    render(<Progress indeterminate value={50} />);
    const fill = screen.getByTestId(ProgressTestId.Fill);
    expect(fill).toHaveClass("animate-progress-indeterminate");
    expect(fill).not.toHaveStyle({ width: "50%" });
  });
});

describe("usageTone", () => {
  it("maps usage to traffic-light tones", () => {
    expect(getUsageTone(10)).toBe("ok");
    expect(getUsageTone(70)).toBe("warn");
    expect(getUsageTone(90)).toBe("bad");
  });
});
