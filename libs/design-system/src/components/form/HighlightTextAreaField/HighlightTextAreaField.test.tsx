import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { HighlightTextAreaField, HighlightTextAreaFieldTestId } from "./HighlightTextAreaField";

describe("HighlightTextAreaField", () => {
  it("renders a labelled textarea with a hint", () => {
    render(
      <HighlightTextAreaField highlights={[]} hint="napiš cestu" label="Zadání" value="ahoj" />,
    );
    const control = screen.getByTestId(HighlightTextAreaFieldTestId.Control);
    expect(control).toHaveRole("textbox");
    expect(control).toHaveAccessibleName("Zadání");
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("napiš cestu");
  });

  it("renders no marks when there are no highlights", () => {
    render(<HighlightTextAreaField highlights={[]} label="Zadání" value="just prose" />);
    expect(screen.queryByTestId(HighlightTextAreaFieldTestId.Mark)).not.toBeInTheDocument();
  });

  it("marks the highlighted span with the matching text on the backdrop", () => {
    // "open ~/a/b" → highlight the path span [5, 10).
    render(<HighlightTextAreaField highlights={[{ start: 5, end: 10 }]} label="Zadání" value="open ~/a/b" />);
    const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("~/a/b");
    // The highlight layer is hidden from assistive tech — the textarea carries the text.
    expect(screen.getByTestId(HighlightTextAreaFieldTestId.Backdrop)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("coalesces overlapping spans into a single mark", () => {
    render(
      <HighlightTextAreaField
        highlights={[
          { start: 0, end: 4 },
          { start: 2, end: 6 },
        ]}
        label="Zadání"
        value="abcdefgh"
      />,
    );
    const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("abcdef");
  });

  it("keeps the default mark untoned (byte-identical bg-accent/20, no ring)", () => {
    render(<HighlightTextAreaField highlights={[{ start: 0, end: 4 }]} label="Zadání" value="ahoj" />);
    const mark = screen.getByTestId(HighlightTextAreaFieldTestId.Mark);
    expect(mark).toHaveClass("bg-accent/20");
    expect(mark.className).not.toMatch(/shadow-\[/);
  });

  it("tints a toned range's mark and adds its ring, leaving other marks untoned", () => {
    render(
      <HighlightTextAreaField
        highlights={[
          { start: 0, end: 5, tone: "push" },
          { start: 10, end: 13 },
        ]}
        label="Zadání"
        value="@delivery run"
      />,
    );
    const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("@deli");
    expect(marks[0]).toHaveClass("bg-risk-push/[0.14]");
    expect(marks[0]?.className).toMatch(/shadow-\[/);
    expect(marks[1]).toHaveTextContent("run");
    expect(marks[1]).toHaveClass("bg-accent/20");
  });

  it("fires onChange as the operator edits", () => {
    const onChange = vi.fn();
    render(
      <HighlightTextAreaField highlights={[]} label="Zadání" onChange={onChange} value="a" />,
    );
    fireEvent.change(screen.getByTestId(HighlightTextAreaFieldTestId.Control), {
      target: { value: "ab" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("syncs backdrop scroll to the textarea", () => {
    render(<HighlightTextAreaField highlights={[]} label="Zadání" value="lots of text" />);
    const control = screen.getByTestId(HighlightTextAreaFieldTestId.Control);
    control.scrollTop = 40;
    fireEvent.scroll(control);
    expect(screen.getByTestId(HighlightTextAreaFieldTestId.Backdrop).scrollTop).toBe(40);
  });
});
