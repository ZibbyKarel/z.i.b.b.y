import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders its content", () => {
    render(<Chip tone="ok">hotovo</Chip>);
    expect(screen.getByText("hotovo")).toBeInTheDocument();
  });

  it("applies a solid tone variant", () => {
    render(
      <Chip tone="accent" solid>
        work
      </Chip>,
    );
    expect(screen.getByText("work").className).toContain("text-accent-contrast");
  });
});
