import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Row, Stack, StackTestId } from "./Stack";

describe("Stack", () => {
  it("renders as a div by default", () => {
    render(<Stack>x</Stack>);
    expect(screen.getByTestId(StackTestId.Root).nodeName).toBe("DIV");
  });

  it("defaults to column direction", () => {
    render(<Stack>x</Stack>);
    expect(screen.getByTestId(StackTestId.Root).style.flexDirection).toBe(
      "column",
    );
  });

  it("renders row direction", () => {
    render(<Stack direction="row">x</Stack>);
    expect(screen.getByTestId(StackTestId.Root).style.flexDirection).toBe(
      "row",
    );
  });

  it("applies gap from spacing tokens", () => {
    render(<Stack gap="200">x</Stack>);
    expect(screen.getByTestId(StackTestId.Root).style.gap).toBe("16px");
  });

  it("renders as a custom tag via as prop", () => {
    render(
      <Stack as="ul">
        <li>item</li>
      </Stack>,
    );
    expect(screen.getByTestId(StackTestId.Root).nodeName).toBe("UL");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(
      <Stack
        ref={(el) => {
          node = el;
        }}
      >
        x
      </Stack>,
    );
    expect(node).not.toBeNull();
  });

  it("sets flexGrow when grow=true", () => {
    render(<Stack grow>x</Stack>);
    expect(screen.getByTestId(StackTestId.Root).style.flexGrow).toBe("1");
  });
});

describe("Row", () => {
  it("defaults to row direction with center alignment", () => {
    render(<Row>x</Row>);
    const el = screen.getByTestId(StackTestId.Root);
    expect(el.style.flexDirection).toBe("row");
    expect(el.style.alignItems).toBe("center");
  });
});
