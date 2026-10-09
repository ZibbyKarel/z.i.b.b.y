import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContainer } from "./PageContainer";

describe("PageContainer", () => {
  it("renders children", () => {
    render(<PageContainer>obsah</PageContainer>);
    expect(screen.getByText("obsah")).toBeInTheDocument();
  });

  it("always spans the full available width, with no max-width cap", () => {
    render(<PageContainer>x</PageContainer>);
    const el = screen.getByText("x");
    expect(el).toHaveStyle({ width: "100%" });
    expect(el.style.maxWidth).toBe("");
  });
});
