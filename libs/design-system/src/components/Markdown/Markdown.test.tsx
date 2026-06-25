import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown, MarkdownTestId } from "./Markdown";

describe("Markdown", () => {
  it("renders a heading as a real heading element", () => {
    render(<Markdown source="# Hello" />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("renders list items", () => {
    render(<Markdown source={"- item one\n- item two"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders strong emphasis", () => {
    const { container } = render(<Markdown source="**bold**" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
  });

  it("exposes the root testid", () => {
    render(<Markdown source="text" />);
    expect(screen.getByTestId(MarkdownTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  describe("escapeHtml", () => {
    const source = "Wrap it in <Suspense> and a <CustomTag> here.\n\n```tsx\nconst x = <div>hi</div>;\n```";

    it("parses raw HTML by default (stray tags become empty elements, swallowed)", () => {
      const { container } = render(<Markdown source={source} />);
      // The bare tags are interpreted as HTML and rendered as empty elements,
      // so their text is lost — the pre-existing behaviour this opt-in fixes.
      expect(container.textContent).not.toContain("<Suspense>");
    });

    it("renders stray tags as literal text when escapeHtml is set", () => {
      const { container } = render(<Markdown escapeHtml source={source} />);
      expect(container.textContent).toContain("<Suspense>");
      expect(container.textContent).toContain("<CustomTag>");
    });

    it("still renders a fenced code block (and its angle brackets) when escapeHtml is set", () => {
      const { container } = render(<Markdown escapeHtml source={source} />);
      expect(container.querySelector("code")).toHaveTextContent("const x = <div>hi</div>;");
    });

    it("still renders markdown structure (lists) when escapeHtml is set", () => {
      render(<Markdown escapeHtml source={"- one\n- two"} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
  });
});
