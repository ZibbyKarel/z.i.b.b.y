import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container, ContainerTestId } from "./Container";

describe("Container", () => {
  it("renders as a div by default", () => {
    render(<Container>x</Container>);
    expect(screen.getByTestId(ContainerTestId.Root).nodeName).toBe("DIV");
  });

  it("renders as a custom tag via as prop", () => {
    render(<Container as="section">x</Container>);
    expect(screen.getByTestId(ContainerTestId.Root).nodeName).toBe("SECTION");
  });

  it("applies uniform padding from spacing tokens", () => {
    render(<Container padding="200">x</Container>);
    expect(screen.getByTestId(ContainerTestId.Root).style.padding).toContain("16px");
  });

  it("applies width and height", () => {
    render(
      <Container height="50px" width="100px">
        x
      </Container>,
    );
    const el = screen.getByTestId(ContainerTestId.Root);
    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("50px");
  });

  it("sets flexGrow when grow=true", () => {
    render(<Container grow>x</Container>);
    expect(screen.getByTestId(ContainerTestId.Root).style.flexGrow).toBe("1");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(
      <Container
        ref={(el) => {
          node = el;
        }}
      >
        x
      </Container>,
    );
    expect(node).not.toBeNull();
  });
});
