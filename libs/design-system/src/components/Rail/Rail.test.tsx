import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Rail, RailTestId } from "./Rail";

describe("Rail", () => {
  it("renders the default title", () => {
    render(<Rail />);
    expect(screen.getByTestId(RailTestId.Header)).toHaveTextContent("Needs you");
  });

  it("renders a custom title", () => {
    render(<Rail title="Waiting on you" />);
    expect(screen.getByTestId(RailTestId.Header)).toHaveTextContent("Waiting on you");
  });

  it("renders the count when provided", () => {
    render(<Rail count={3} />);
    expect(screen.getByTestId(RailTestId.Count)).toHaveTextContent("3");
  });

  it("omits the count when not provided", () => {
    render(<Rail />);
    expect(screen.queryByTestId(RailTestId.Count)).toBeNull();
  });

  it("renders children in the body", () => {
    render(
      <Rail>
        <div>Approval card one</div>
      </Rail>,
    );
    expect(screen.getByTestId(RailTestId.Body)).toHaveTextContent("Approval card one");
    expect(screen.queryByTestId(RailTestId.Empty)).toBeNull();
  });

  it("renders the empty slot when there are no children", () => {
    render(<Rail empty="Nothing is waiting for you." />);
    expect(screen.getByTestId(RailTestId.Empty)).toHaveTextContent(
      "Nothing is waiting for you.",
    );
  });

  it("renders the aside landmark", () => {
    render(<Rail />);
    expect(screen.getByTestId(RailTestId.Root)).toHaveRole("complementary");
  });
});
