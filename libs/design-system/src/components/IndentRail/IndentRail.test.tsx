import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndentRail, IndentRailTestId } from "./IndentRail";

describe("IndentRail", () => {
  it("renders its children inside the rail", () => {
    render(
      <IndentRail>
        <span>kid</span>
      </IndentRail>,
    );
    expect(screen.getByTestId(IndentRailTestId.Root)).toHaveTextContent("kid");
  });

  it("passes the ref through", () => {
    let el: HTMLDivElement | null = null;
    render(
      <IndentRail ref={(n) => void (el = n)}>
        <span>kid</span>
      </IndentRail>,
    );
    expect(el).toBe(screen.getByTestId(IndentRailTestId.Root));
  });
});
