import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Kbd, KbdTestId } from "./Kbd";

describe("Kbd", () => {
  it("renders as a kbd element", () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByTestId(KbdTestId.Root).nodeName).toBe("KBD");
  });

  it("renders its shortcut text", () => {
    render(<Kbd>Enter</Kbd>);
    expect(screen.getByTestId(KbdTestId.Root)).toHaveTextContent("Enter");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(<Kbd ref={(el) => { node = el; }}>⌘K</Kbd>);
    expect(node).not.toBeNull();
  });
});
