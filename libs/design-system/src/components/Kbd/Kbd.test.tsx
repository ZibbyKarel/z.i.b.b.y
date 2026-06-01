import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Kbd } from "./Kbd";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Kbd", () => {
  it("renders as a kbd element", () => {
    const { container } = wrap(<Kbd>⌘K</Kbd>);
    expect(container.querySelector("kbd")).not.toBeNull();
  });

  it("renders its shortcut text", () => {
    wrap(<Kbd>Enter</Kbd>);
    expect(screen.getByText("Enter")).toBeInTheDocument();
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    wrap(<Kbd ref={(el) => { node = el; }}>⌘K</Kbd>);
    expect(node).not.toBeNull();
  });
});
