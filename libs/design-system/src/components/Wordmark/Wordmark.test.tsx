import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Wordmark, WordmarkTestId } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the default brand text", () => {
    render(<Wordmark />);
    expect(screen.getByTestId(WordmarkTestId.Root)).toHaveTextContent("ZIBBYCORP");
  });

  it("renders an overridden text", () => {
    render(<Wordmark>ACME CORP</Wordmark>);
    expect(screen.getByTestId(WordmarkTestId.Root)).toHaveTextContent("ACME CORP");
  });

  it("renders as a span with an accessible name", () => {
    render(<Wordmark />);
    const el = screen.getByTestId(WordmarkTestId.Root);
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAccessibleName("ZIBBYCORP");
  });
});
