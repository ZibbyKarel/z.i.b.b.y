import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "../../utils/testRender";
import { Divider, DividerTestId } from "./Divider";

describe("Divider", () => {
  it("renders a separator element", () => {
    render(<Divider />);
    expect(screen.getByTestId(DividerTestId.Root)).toHaveRole("separator");
  });

  it("is aria-hidden", () => {
    render(<Divider />);
    expect(screen.getByTestId(DividerTestId.Root)).toHaveAttribute("aria-hidden");
  });

  it("horizontal variant spans full width at 1px height", () => {
    render(<Divider orientation="horizontal" />);
    expect(screen.getByTestId(DividerTestId.Root)).toHaveClass("h-px", "w-full");
  });

  it("vertical variant is 1px wide", () => {
    render(<Divider orientation="vertical" />);
    expect(screen.getByTestId(DividerTestId.Root)).toHaveClass("w-px", "self-stretch");
  });
});
