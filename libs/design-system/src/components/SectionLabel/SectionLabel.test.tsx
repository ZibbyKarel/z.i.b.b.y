import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel, SectionLabelTestId } from "./SectionLabel";

describe("SectionLabel", () => {
  it("renders the label text", () => {
    render(<SectionLabel>Org map</SectionLabel>);
    expect(screen.getByTestId(SectionLabelTestId.Text)).toHaveTextContent("Org map");
  });

  it("zero-pads the index and prefixes it with an em dash", () => {
    render(<SectionLabel index={3}>Org map</SectionLabel>);
    expect(screen.getByTestId(SectionLabelTestId.Index)).toHaveTextContent("03 —");
  });

  it("omits the index when not given", () => {
    render(<SectionLabel>Org map</SectionLabel>);
    expect(screen.queryByTestId(SectionLabelTestId.Index)).not.toBeInTheDocument();
  });

  it("renders the action slot only when provided", () => {
    const { rerender } = render(<SectionLabel>Org map</SectionLabel>);
    expect(screen.queryByTestId(SectionLabelTestId.Action)).not.toBeInTheDocument();
    rerender(<SectionLabel action={<button type="button">Clear</button>}>Org map</SectionLabel>);
    expect(screen.getByTestId(SectionLabelTestId.Action)).toHaveTextContent("Clear");
  });

  it("forwards a ref to the root", () => {
    let node: HTMLElement | null = null;
    render(
      <SectionLabel
        ref={(el) => {
          node = el;
        }}
      >
        Org map
      </SectionLabel>,
    );
    expect(node).toBeInstanceOf(HTMLDivElement);
  });
});
