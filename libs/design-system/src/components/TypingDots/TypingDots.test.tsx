import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypingDots, TypingDotsTestId } from "./TypingDots";

describe("TypingDots", () => {
  it("renders three dots with an accessible label", () => {
    render(<TypingDots label="ZIBBY píše…" />);
    expect(screen.getByRole("status", { name: "ZIBBY píše…" })).toBeInTheDocument();
    expect(screen.getAllByTestId(TypingDotsTestId.Dot)).toHaveLength(3);
  });

  it("staggers each dot's animation delay", () => {
    render(<TypingDots label="typing" />);
    const [first, second, third] = screen.getAllByTestId(TypingDotsTestId.Dot);
    expect(first?.className).toContain("[animation-delay:0ms]");
    expect(second?.className).toContain("[animation-delay:150ms]");
    expect(third?.className).toContain("[animation-delay:300ms]");
  });
});
