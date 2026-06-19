import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { LimitsRings, formatResetIn } from "./LimitsRings";

describe("LimitsRings", () => {
  it("renders both window rings from the static zero-usage fallback", () => {
    renderWithProviders(<LimitsRings />);
    // Before the first poll the query is pending, so the rings render from the
    // static CLAUDE_LIMITS fallback rather than flashing empty.
    expect(screen.getByLabelText("5h rolling")).toBeInTheDocument();
    expect(screen.getByLabelText("Týdenní")).toBeInTheDocument();
  });
});

describe("formatResetIn", () => {
  const now = 1_000_000_000_000;

  it("renders all three parts when present", () => {
    const ms = 6 * 86_400_000 + 12 * 3_600_000 + 4 * 60_000;
    expect(formatResetIn(now + ms, now)).toBe("6d 12h 4m");
  });

  it("drops leading zero parts (sub-day span)", () => {
    expect(formatResetIn(now + 12 * 3_600_000 + 4 * 60_000, now)).toBe("12h 4m");
  });

  it("drops zero parts in the middle and at the end", () => {
    // 6 days, 0 hours, 4 minutes → omit the zero hours.
    expect(formatResetIn(now + 6 * 86_400_000 + 4 * 60_000, now)).toBe("6d 4m");
    // 6 days exactly → only the day part survives.
    expect(formatResetIn(now + 6 * 86_400_000, now)).toBe("6d");
  });

  it("keeps minutes when nothing larger survives", () => {
    expect(formatResetIn(now + 4 * 60_000, now)).toBe("4m");
    expect(formatResetIn(now + 30_000, now)).toBe("0m");
  });

  it("returns null when the reset is unknown or already elapsed", () => {
    expect(formatResetIn(null, now)).toBeNull();
    expect(formatResetIn(now, now)).toBeNull();
    expect(formatResetIn(now - 60_000, now)).toBeNull();
  });
});
