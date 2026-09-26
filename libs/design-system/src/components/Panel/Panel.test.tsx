import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardTestId } from "../Card/Card";
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
    expect(header).toHaveTextContent("Title");
    expect(header).toHaveTextContent("42 lines");
  });

  it("lets a consumer override the test-id (spread after the default)", () => {
    render(<Panel data-testid="custom-panel">x</Panel>);
    expect(screen.getByTestId("custom-panel")).toBeInTheDocument();
  });

  it("stays matte by default and elevates with elevated", () => {
    const { rerender } = render(<Panel>x</Panel>);
    expect(screen.getByTestId(PanelTestId.Root).className).toContain("bg-surface");

    rerender(<Panel elevated>x</Panel>);
    expect(screen.getByTestId(PanelTestId.Root).className).toContain("bg-elevated");
  });

  it("lets a consumer override background/radius (a row nested on its own section panel)", () => {
    render(
      <Panel background="background" radius="sm">
        x
      </Panel>,
    );
    const root = screen.getByTestId(PanelTestId.Root);
    expect(root.className).toContain("bg-background");
    expect(root.className).toContain("rounded-sm");
  });

  it("tints the border and renders corner brackets when tone is set", () => {
    render(<Panel tone="warn">x</Panel>);
    const root = screen.getByTestId(PanelTestId.Root);
    expect(root.className).toContain("border-warn");
    expect(screen.getAllByTestId(CardTestId.Corner)).toHaveLength(4);
  });

  it("renders corner brackets from live/liveTone alone, with no tone set", () => {
    render(
      <Panel live liveTone="warn">
        x
      </Panel>,
    );
    expect(screen.getAllByTestId(CardTestId.Corner)).toHaveLength(4);
  });

  it("omits the corner brackets when neither tone nor live is set", () => {
    render(<Panel>x</Panel>);
    expect(screen.queryByTestId(CardTestId.Corner)).not.toBeInTheDocument();
  });
});
