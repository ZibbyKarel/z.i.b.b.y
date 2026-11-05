import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Wordmark, WordmarkTestId } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the default brand text, not CSS-uppercased", () => {
    render(<Wordmark />);
    const name = screen.getByTestId(WordmarkTestId.Name);
    expect(name).toHaveTextContent("ZibbyOS");
    expect(name.className).not.toContain("uppercase");
  });

  it("renders an overridden text", () => {
    render(<Wordmark>ACME CORP</Wordmark>);
    expect(screen.getByTestId(WordmarkTestId.Root)).toHaveTextContent("ACME CORP");
  });

  it("renders as a span with an accessible name", () => {
    render(<Wordmark />);
    const el = screen.getByTestId(WordmarkTestId.Root);
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAccessibleName("ZibbyOS");
  });

  it("renders no version line by default", () => {
    render(<Wordmark />);
    expect(screen.queryByTestId(WordmarkTestId.Version)).toBeNull();
  });

  it("renders the version as a small second line", () => {
    render(<Wordmark version="v0.2.1" />);
    expect(screen.getByTestId(WordmarkTestId.Version)).toHaveTextContent("v0.2.1");
    expect(screen.getByTestId(WordmarkTestId.Root)).toHaveAccessibleName("ZibbyOS v0.2.1");
  });
});
