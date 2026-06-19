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
});

describe("usageTone", () => {
  it("maps usage to traffic-light tones", () => {
    expect(getUsageTone(10)).toBe("ok");
    expect(getUsageTone(70)).toBe("warn");
    expect(getUsageTone(90)).toBe("bad");
  });
});
