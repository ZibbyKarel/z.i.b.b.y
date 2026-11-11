import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pressable, PressableTestId } from "./Pressable";

describe("Pressable", () => {
  it("renders an accessible button with its content", () => {
    render(<Pressable aria-label="změnit">badge</Pressable>);
    const el = screen.getByTestId(PressableTestId.Root);
    expect(el).toHaveRole("button");
    expect(el).toHaveAccessibleName("změnit");
    expect(el).toHaveTextContent("badge");
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Pressable onClick={onClick}>x</Pressable>);
    await userEvent.click(screen.getByTestId(PressableTestId.Root));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("tints the pill with the given chipTone", () => {
    render(
      <Pressable aria-expanded chipTone="run">
        3
      </Pressable>,
    );
    const el = screen.getByTestId(PressableTestId.Root);
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("aria-expanded:bg-run/15");
  });

  it("underlines its text on hover only when asked", () => {
    const { rerender } = render(<Pressable>x</Pressable>);
    expect(screen.getByTestId(PressableTestId.Root).className).not.toContain("hover:underline");
    rerender(<Pressable underline="hover">x</Pressable>);
    expect(screen.getByTestId(PressableTestId.Root).className).toContain("hover:underline");
  });
});
