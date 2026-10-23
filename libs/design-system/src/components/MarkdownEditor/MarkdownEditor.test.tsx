import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext";
import { MarkdownEditor, MarkdownEditorTestId } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  it("associates the label with the textarea and shows the value", () => {
    render(<MarkdownEditor label="agent.md" onChange={() => {}} value="# Hello" />);
    const control = screen.getByTestId(MarkdownEditorTestId.Control);
    expect(control).toHaveAccessibleName("agent.md");
    expect(control).toHaveValue("# Hello");
  });

  it("emits the edited Markdown body", () => {
    const onChange = vi.fn();
    render(<MarkdownEditor label="agent.md" onChange={onChange} value="" />);
    fireEvent.change(screen.getByTestId(MarkdownEditorTestId.Control), {
      target: { value: "## Role" },
    });
    expect(onChange).toHaveBeenCalledWith("## Role");
  });

  it("renders a hint and falls back to ariaLabel when unlabelled", () => {
    render(
      <MarkdownEditor
        ariaLabel="agent body"
        hint="Frontmatter is assembled by the backend"
        onChange={() => {}}
        value=""
      />,
    );
    expect(screen.getByTestId(MarkdownEditorTestId.Control)).toHaveAccessibleName("agent body");
    expect(screen.getByTestId(MarkdownEditorTestId.Hint)).toHaveTextContent(
      "Frontmatter is assembled by the backend",
    );
  });

  it("follows the DS theme instead of a hard-coded dark skin", () => {
    render(
      <DesignSystemProvider theme="light">
        <MarkdownEditor label="agent.md" onChange={() => {}} value="" />
      </DesignSystemProvider>,
    );
    expect(screen.getByTestId(MarkdownEditorTestId.Frame)).toHaveAttribute(
      "data-color-mode",
      "light",
    );
  });
});
