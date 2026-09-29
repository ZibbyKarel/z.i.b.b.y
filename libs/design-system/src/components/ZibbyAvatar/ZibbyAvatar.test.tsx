import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATE_ORDER, stateToneVar } from "../../stateTone";
import { ZIBBY_AVATAR_ROWS, ZibbyAvatar, ZibbyAvatarTestId } from "./ZibbyAvatar";

describe("ZibbyAvatar", () => {
  it("draws a mirrored 16-wide pixel map that fits the 16×16 favicon grid", () => {
    expect(ZIBBY_AVATAR_ROWS.length).toBeLessThanOrEqual(15);
    for (const row of ZIBBY_AVATAR_ROWS) {
      expect(row).toHaveLength(16);
      expect(row).toBe(row.split("").reverse().join(""));
    }
  });

  for (const state of STATE_ORDER) {
    it(`renders state="${state}" as a crisp 16×16 SVG tinted by the state tone`, () => {
      render(<ZibbyAvatar state={state} />);
      const svg = screen.getByTestId(ZibbyAvatarTestId.Root);
      expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
      expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
      expect(svg).toHaveAttribute("data-state", state);
      expect(screen.getByTestId(ZibbyAvatarTestId.Accent).style.fill).toBe(stateToneVar[state]);
    });
  }

  it("sizes via width/height (sealed sizing)", () => {
    render(<ZibbyAvatar size={112} state="idle" />);
    const svg = screen.getByTestId(ZibbyAvatarTestId.Root);
    expect(svg).toHaveAttribute("width", "112");
    expect(svg).toHaveAttribute("height", "112");
  });

  it("is decorative without a label and an img with one", () => {
    const { unmount } = render(<ZibbyAvatar state="working" />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAttribute("aria-hidden", "true");
    unmount();

    render(<ZibbyAvatar label="Zibby · COO" state="working" />);
    const svg = screen.getByTestId(ZibbyAvatarTestId.Root);
    expect(svg).toHaveRole("img");
    expect(svg).toHaveAccessibleName("Zibby · COO");
  });

  it("stops all motion with animate={false}", () => {
    render(<ZibbyAvatar animate={false} state="working" />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Accent).style.animation).toBe("none");
  });
});
