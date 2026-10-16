import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATE_ORDER, stateToneVar } from "../../stateTone";
import { ZIBBY_AVATAR_ROWS, ZibbyAvatar, ZibbyAvatarTestId } from "./ZibbyAvatar";

describe("ZibbyAvatar", () => {
  it("still exports the legacy mirrored pixel map for the favicon tooling", () => {
    expect(ZIBBY_AVATAR_ROWS.length).toBeLessThanOrEqual(15);
    for (const row of ZIBBY_AVATAR_ROWS) {
      expect(row).toHaveLength(16);
      expect(row).toBe(row.split("").reverse().join(""));
    }
  });

  for (const state of STATE_ORDER) {
    it(`renders state="${state}" as the Zibby minion tinted by the state tone`, () => {
      render(<ZibbyAvatar state={state} />);
      const svg = screen.getByTestId(ZibbyAvatarTestId.Root);
      expect(svg).toHaveAttribute("viewBox", "0 0 100 120");
      expect(svg).toHaveAttribute("data-state", state);
      expect(screen.getByTestId(ZibbyAvatarTestId.Accent).style.color).toBe(stateToneVar[state]);
    });
  }

  it("draws the glow goggles in the state colour", () => {
    render(<ZibbyAvatar state="thinking" />);
    const lens = Array.from(
      screen.getByTestId(ZibbyAvatarTestId.Root).querySelectorAll("circle"),
    ).filter(
      (c) => c.style.fill === stateToneVar.thinking && c.getAttribute("stroke-width") === "2.4",
    );
    expect(lens).toHaveLength(2);
  });

  it("sizes via height and the 100:120 aspect width (sealed sizing)", () => {
    render(<ZibbyAvatar size={112} state="idle" />);
    const svg = screen.getByTestId(ZibbyAvatarTestId.Root);
    expect(svg).toHaveAttribute("height", "112");
    expect(svg).toHaveAttribute("width", "93");
  });

  it("renders at the 128 and 200 lobby sizes", () => {
    const { unmount } = render(<ZibbyAvatar size={128} state="idle" />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAttribute("height", "128");
    unmount();
    render(<ZibbyAvatar size={200} state="idle" />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAttribute("height", "200");
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

  it("stops all CSS motion with animate={false}", () => {
    render(<ZibbyAvatar animate={false} state="thinking" />);
    const root = screen.getByTestId(ZibbyAvatarTestId.Root);
    expect(root.innerHTML).not.toContain("mv-");
  });

  it("animates the thinking bubbles by default", () => {
    render(<ZibbyAvatar state="thinking" />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root).innerHTML).toContain("mv-pulse");
  });
});
