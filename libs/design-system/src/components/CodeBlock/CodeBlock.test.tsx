import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeBlock, CodeBlockTestId } from "./CodeBlock";

describe("CodeBlock", () => {
  it("renders the text inside a pre region", () => {
    render(<CodeBlock text={"line one\nline two"} />);
    expect(screen.getByTestId(CodeBlockTestId.Pre)).toHaveTextContent("line one line two");
  });

  it("shows the placeholder while text is empty", () => {
    render(<CodeBlock placeholder="waiting…" text="" />);
    expect(screen.getByTestId(CodeBlockTestId.Placeholder)).toHaveTextContent("waiting…");
    expect(screen.queryByTestId(CodeBlockTestId.Pre)).toBeNull();
  });

  it("renders a caret only when requested", () => {
    const { rerender } = render(<CodeBlock text="x" />);
    expect(screen.queryByTestId(CodeBlockTestId.Caret)).toBeNull();
    rerender(<CodeBlock caret text="x" />);
    expect(screen.getByTestId(CodeBlockTestId.Caret)).toBeInTheDocument();
  });

  it("forwards a ref to the scroll container", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<CodeBlock ref={ref} text="x" />);
    expect(ref.current).toBe(screen.getByTestId(CodeBlockTestId.Root));
  });
});
