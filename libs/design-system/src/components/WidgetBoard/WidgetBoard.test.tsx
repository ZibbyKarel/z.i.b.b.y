import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { WidgetBoard, WidgetBoardTestId } from "./WidgetBoard";

describe("WidgetBoard", () => {
  it("renders children on a sized placement surface", () => {
    render(
      <WidgetBoard colWidth={80} gap={12} height={400}>
        <span>child</span>
      </WidgetBoard>,
    );
    expect(screen.getByTestId(WidgetBoardTestId.Inner)).toHaveStyle({ height: "400px" });
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("draws column guides only while editing", () => {
    const { rerender } = render(<WidgetBoard colWidth={80} gap={12} height={400} />);
    expect(screen.getByTestId(WidgetBoardTestId.Inner).style.backgroundImage).toBe("");
    rerender(<WidgetBoard editing colWidth={80} gap={12} height={400} />);
    expect(screen.getByTestId(WidgetBoardTestId.Inner).style.backgroundImage).toContain(
      "repeating-linear-gradient",
    );
  });
});
