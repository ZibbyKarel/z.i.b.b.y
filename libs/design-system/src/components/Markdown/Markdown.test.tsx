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
});
