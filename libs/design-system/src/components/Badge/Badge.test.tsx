import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>opus</Badge>);
    expect(screen.getByText("opus")).toBeInTheDocument();
  });

  it("renders as a span", () => {
    render(<Badge>test</Badge>);
    expect(screen.getByText("test").tagName).toBe("SPAN");
  });

  it("forwards a ref", () => {
    let node: HTMLSpanElement | null = null;
    render(<Badge ref={(el) => { node = el; }}>ref</Badge>);
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("sets transparent border when solid=true", () => {
    render(<Badge tone="accent" solid>accent</Badge>);
    expect(screen.getByText("accent").style.borderColor).toBe("transparent");
  });
});
