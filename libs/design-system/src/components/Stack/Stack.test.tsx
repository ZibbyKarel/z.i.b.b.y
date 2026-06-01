import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack, Row } from "./Stack";

describe("Stack", () => {
  it("renders as a div by default", () => {
    const { container } = render(<Stack>x</Stack>);
    expect(container.firstChild?.nodeName).toBe("DIV");
  });

  it("defaults to column direction", () => {
    const { container } = render(<Stack>x</Stack>);
    expect((container.firstChild as HTMLElement).style.flexDirection).toBe("column");
  });

  it("renders row direction", () => {
    const { container } = render(<Stack direction="row">x</Stack>);
    expect((container.firstChild as HTMLElement).style.flexDirection).toBe("row");
  });

  it("applies gap from spacing tokens", () => {
    const { container } = render(<Stack gap="200">x</Stack>);
    expect((container.firstChild as HTMLElement).style.gap).toBe("16px");
  });

  it("renders as a custom tag via as prop", () => {
    const { container } = render(<Stack as="ul"><li>item</li></Stack>);
    expect(container.firstChild?.nodeName).toBe("UL");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(<Stack ref={(el) => { node = el; }}>x</Stack>);
    expect(node).not.toBeNull();
  });

  it("sets flexGrow when grow=true", () => {
    const { container } = render(<Stack grow>x</Stack>);
    expect((container.firstChild as HTMLElement).style.flexGrow).toBe("1");
  });
});

describe("Row", () => {
  it("defaults to row direction with center alignment", () => {
    const { container } = render(<Row>x</Row>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.flexDirection).toBe("row");
    expect(el.style.alignItems).toBe("center");
  });
});
