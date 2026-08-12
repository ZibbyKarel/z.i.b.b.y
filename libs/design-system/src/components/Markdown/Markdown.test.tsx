import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown, MarkdownTestId } from "./Markdown";

describe("Markdown", () => {
  it("renders a heading as a real heading element", () => {
    render(<Markdown source="# Hello" />);
    const heading = screen.getByTestId(MarkdownTestId.Heading);
    expect(heading).toHaveRole("heading");
    expect(heading).toHaveAccessibleName("Hello");
  });

  it("renders list items", () => {
    render(<Markdown source={"- item one\n- item two"} />);
    const items = screen.getAllByTestId(MarkdownTestId.ListItem);
    expect(items).toHaveLength(2);
    items.forEach((item) => expect(item).toHaveRole("listitem"));
  });

  it("renders strong emphasis", () => {
    render(<Markdown source="**bold**" />);
    expect(screen.getByTestId(MarkdownTestId.Strong)).toHaveTextContent("bold");
  });

  it("exposes the root testid", () => {
    render(<Markdown source="text" />);
    const root = screen.getByTestId(MarkdownTestId.Root);
    expect(root).toBeInTheDocument();
    expect(root).toHaveTextContent("text");
  });

  describe("escapeHtml", () => {
    const source =
      "Wrap it in <Suspense> and a <CustomTag> here.\n\n```tsx\nconst x = <div>hi</div>;\n```";

    it("parses raw HTML by default (stray tags become empty elements, swallowed)", () => {
      render(<Markdown source={source} />);
      // The bare tags are interpreted as HTML and rendered as empty elements,
      // so their text is lost, the pre-existing behaviour this opt-in fixes.
      expect(screen.getByTestId(MarkdownTestId.Root)).not.toHaveTextContent("<Suspense>");
    });

    it("renders stray tags as literal text when escapeHtml is set", () => {
      render(<Markdown escapeHtml source={source} />);
      const root = screen.getByTestId(MarkdownTestId.Root);
      expect(root).toHaveTextContent("<Suspense>");
      expect(root).toHaveTextContent("<CustomTag>");
    });

    it("still renders a fenced code block (and its angle brackets) when escapeHtml is set", () => {
      render(<Markdown escapeHtml source={source} />);
      expect(screen.getByTestId(MarkdownTestId.CodeBlock)).toHaveTextContent(
        "const x = <div>hi</div>;",
      );
    });

    it("still renders markdown structure (lists) when escapeHtml is set", () => {
      render(<Markdown escapeHtml source={"- one\n- two"} />);
      const items = screen.getAllByTestId(MarkdownTestId.ListItem);
      expect(items).toHaveLength(2);
      items.forEach((item) => expect(item).toHaveRole("listitem"));
    });
  });
});
