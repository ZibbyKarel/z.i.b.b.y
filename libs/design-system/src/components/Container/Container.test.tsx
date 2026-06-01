import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container } from "./Container";

describe("Container", () => {
  it("renders as a div by default", () => {
    const { container } = render(<Container>x</Container>);
    expect(container.firstChild?.nodeName).toBe("DIV");
  });

  it("renders as a custom tag via as prop", () => {
    const { container } = render(<Container as="section">x</Container>);
    expect(container.firstChild?.nodeName).toBe("SECTION");
  });

  it("applies uniform padding from spacing tokens", () => {
    const { container } = render(<Container padding="200">x</Container>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.padding).toContain("16px");
  });

  it("applies width and height", () => {
    const { container } = render(<Container width="100px" height="50px">x</Container>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("50px");
  });

  it("sets flexGrow when grow=true", () => {
    const { container } = render(<Container grow>x</Container>);
    expect((container.firstChild as HTMLElement).style.flexGrow).toBe("1");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(<Container ref={(el) => { node = el; }}>x</Container>);
    expect(node).not.toBeNull();
  });
});
