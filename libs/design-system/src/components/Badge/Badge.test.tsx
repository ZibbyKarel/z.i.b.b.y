import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Badge, BadgeTestId } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>opus</Badge>);
    expect(screen.getByTestId(BadgeTestId.Root)).toHaveTextContent("opus");
  });

  it("renders as a span", () => {
    render(<Badge>test</Badge>);
    expect(screen.getByTestId(BadgeTestId.Root).tagName).toBe("SPAN");
  });

  it("forwards a ref", () => {
    let node: HTMLSpanElement | null = null;
    render(<Badge ref={(el) => { node = el; }}>ref</Badge>);
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("sets transparent border when solid=true", () => {
    render(<Badge solid tone="accent">accent</Badge>);
    expect(screen.getByTestId(BadgeTestId.Root)).toHaveClass("border-transparent");
  });
});
