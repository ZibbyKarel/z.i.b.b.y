import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip, ChipTestId } from "./Chip";

describe("Chip", () => {
  it("renders its content", () => {
    render(<Chip tone="ok">hotovo</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveTextContent("hotovo");
  });

  it("applies a solid tone variant", () => {
    render(
      <Chip solid tone="accent">
        work
      </Chip>,
    );
    expect(screen.getByTestId(ChipTestId.Root)).toHaveClass("text-accent-contrast");
  });
});
