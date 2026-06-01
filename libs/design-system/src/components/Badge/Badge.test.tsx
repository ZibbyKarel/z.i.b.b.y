import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Badge } from "./Badge";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Badge", () => {
  it("renders its children", () => {
    wrap(<Badge>opus</Badge>);
    expect(screen.getByText("opus")).toBeInTheDocument();
  });

  it("renders as a span", () => {
    wrap(<Badge>test</Badge>);
    expect(screen.getByText("test").tagName).toBe("SPAN");
  });

  it("forwards a ref", () => {
    let node: HTMLSpanElement | null = null;
    wrap(<Badge ref={(el) => { node = el; }}>ref</Badge>);
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("sets transparent border when solid=true", () => {
    wrap(<Badge tone="accent" solid>accent</Badge>);
    expect(screen.getByText("accent").style.borderColor).toBe("transparent");
  });
});
