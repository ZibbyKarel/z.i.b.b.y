import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress, ProgressTestId, usageTone } from "./Progress";

describe("Progress", () => {
  it("exposes a progressbar role when labelled", () => {
    render(<Progress value={64} label="5h rolling" />);
    const bar = screen.getByTestId(ProgressTestId.Root);
    expect(bar).toHaveRole("progressbar");
    expect(bar).toHaveAccessibleName("5h rolling");
    expect(bar).toHaveAttribute("aria-valuenow", "64");
  });

  it("clamps values to 0–100", () => {
    render(<Progress value={150} label="over" />);
    expect(screen.getByTestId(ProgressTestId.Root)).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders no progressbar role without a label", () => {
    render(<Progress value={20} />);
    expect(screen.getByTestId(ProgressTestId.Root)).not.toHaveAttribute("role");
  });
});

describe("usageTone", () => {
  it("maps usage to traffic-light tones", () => {
    expect(usageTone(10)).toBe("ok");
    expect(usageTone(70)).toBe("warn");
    expect(usageTone(90)).toBe("bad");
  });
});
