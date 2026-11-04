import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightText, HighlightTextTestId } from "./HighlightText";

const markPattern = new RegExp(`^${HighlightTextTestId.Mark}-`);

describe("HighlightText", () => {
  it("renders the text verbatim with one visible mark per range", () => {
    render(
      <HighlightText
        highlights={[
          { start: 4, end: 12, tone: "accent" },
          { start: 17, end: 26, tone: "push" },
        ]}
        text="ask @Builder and @Delivery now"
      />,
    );
    expect(screen.getByTestId(HighlightTextTestId.Root)).toHaveTextContent(
      "ask @Builder and @Delivery now",
    );
    const marks = screen.getAllByTestId(markPattern);
    expect(marks.map((m) => m.textContent)).toEqual(["@Builder", "@Delivery"]);
    expect(screen.getByTestId(`${HighlightTextTestId.Mark}-4`)).toHaveClass("bg-accent/[0.14]");
    expect(screen.getByTestId(`${HighlightTextTestId.Mark}-17`)).toHaveClass("bg-risk-push/[0.14]");
    expect(screen.getByTestId(`${HighlightTextTestId.Mark}-4`)).not.toHaveClass("text-transparent");
  });

  it("renders plain text with no marks when there are no ranges", () => {
    render(<HighlightText highlights={[]} text="just words" />);
    expect(screen.getByTestId(HighlightTextTestId.Root)).toHaveTextContent("just words");
    expect(screen.queryAllByTestId(markPattern)).toHaveLength(0);
  });
});
