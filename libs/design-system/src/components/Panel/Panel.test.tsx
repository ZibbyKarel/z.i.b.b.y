import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel, PanelTestId } from "./Panel";

describe("Panel", () => {
  it("renders body children", () => {
    render(<Panel>body content</Panel>);
    expect(screen.getByTestId(PanelTestId.Body)).toHaveTextContent("body content");
  });

  it("omits the header bar when no header slots are given", () => {
    render(<Panel>body</Panel>);
    expect(screen.queryByTestId(PanelTestId.Header)).toBeNull();
  });

  it("renders header and right-aligned headerEnd slots", () => {
    render(
      <Panel header={<span>Title</span>} headerEnd={<span>42 lines</span>}>
        body
      </Panel>,
    );
    const header = screen.getByTestId(PanelTestId.Header);
    expect(within(header).getByText("Title")).toBeInTheDocument();
    expect(within(header).getByText("42 lines")).toBeInTheDocument();
  });

  it("lets a consumer override the test-id (spread after the default)", () => {
    render(<Panel data-testid="custom-panel">x</Panel>);
    expect(screen.getByTestId("custom-panel")).toBeInTheDocument();
  });

  it("stays matte by default and elevates with hi", () => {
    const { rerender } = render(<Panel>x</Panel>);
    expect(screen.getByTestId(PanelTestId.Root).className).toContain("bg-surface");

    rerender(<Panel hi>x</Panel>);
    expect(screen.getByTestId(PanelTestId.Root).className).toContain("bg-elevated");
  });
});
