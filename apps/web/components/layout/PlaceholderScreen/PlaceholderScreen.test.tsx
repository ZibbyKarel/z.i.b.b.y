import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { PlaceholderScreen } from "./PlaceholderScreen";

describe("PlaceholderScreen", () => {
  it("renders the given label and the in-progress hint", () => {
    renderWithProviders(<PlaceholderScreen glyph="bot" label="Běhy" />);
    expect(screen.getByText("Běhy")).toBeInTheDocument();
    expect(screen.getByText("// v přípravě")).toBeInTheDocument();
  });
});
