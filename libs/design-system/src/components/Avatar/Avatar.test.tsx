import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarTestId } from "./Avatar";

describe("Avatar", () => {
  it("renders the image when there is a src", () => {
    render(<Avatar name="alice" src="https://x/a.png" />);
    expect(screen.getByTestId(AvatarTestId.Image)).toHaveAttribute("src", "https://x/a.png");
    expect(screen.queryByTestId(AvatarTestId.Fallback)).toBeNull();
  });

  it("falls back to the initial without a src", () => {
    render(<Avatar name="alice" src="" />);
    expect(screen.getByTestId(AvatarTestId.Fallback)).toHaveTextContent("a");
    expect(screen.queryByTestId(AvatarTestId.Image)).toBeNull();
  });

  it("applies the size", () => {
    render(<Avatar name="a" size="md" />);
    expect(screen.getByTestId(AvatarTestId.Root).className).toContain("size-8");
  });
});
