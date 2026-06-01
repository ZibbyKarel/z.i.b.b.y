import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Kbd } from "./Kbd";

describe("Kbd", () => {
  it("renders as a kbd element", () => {
    const { container } = render(<Kbd>⌘K</Kbd>);
    expect(container.querySelector("kbd")).not.toBeNull();
  });

  it("renders its shortcut text", () => {
    render(<Kbd>Enter</Kbd>);
    expect(screen.getByText("Enter")).toBeInTheDocument();
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(<Kbd ref={(el) => { node = el; }}>⌘K</Kbd>);
    expect(node).not.toBeNull();
  });
});
