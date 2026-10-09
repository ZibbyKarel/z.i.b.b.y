import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { InputFrame, InputFrameTestId } from "./InputFrame";

describe("InputFrame", () => {
  it("renders start, body and end slots", () => {
    render(
      <InputFrame end={<i>E</i>} start={<i>S</i>}>
        <input aria-label="x" />
      </InputFrame>,
    );
    expect(screen.getByTestId(InputFrameTestId.Start)).toHaveTextContent("S");
    expect(screen.getByTestId(InputFrameTestId.End)).toHaveTextContent("E");
    expect(screen.getByTestId(InputFrameTestId.Body)).toContainElement(screen.getByLabelText("x"));
    expect(screen.getByTestId(InputFrameTestId.Root)).toHaveClass("border-line-2");
  });

  it("omits empty start/end wrappers", () => {
    render(<InputFrame>body</InputFrame>);
    expect(screen.queryByTestId(InputFrameTestId.Start)).toBeNull();
    expect(screen.queryByTestId(InputFrameTestId.End)).toBeNull();
  });
});
