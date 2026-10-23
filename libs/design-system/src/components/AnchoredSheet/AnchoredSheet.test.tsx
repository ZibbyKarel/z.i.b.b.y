import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { AnchoredSheet, AnchoredSheetTestId } from "./AnchoredSheet";
import { SheetAction, SheetBlock, SheetPartsTestId, SheetText } from "./SheetParts";

const geo = {
  left: 100,
  width: 500,
  top: 0,
  height: 700,
  eraserLeft: -2,
  eraserTop: 40,
  eraserHeight: 30,
};

describe("AnchoredSheet", () => {
  it("renders header parts, chips, body and footer", () => {
    render(
      <AnchoredSheet
        chips={["A", "B"]}
        closeLabel="Close"
        footerEnd={<SheetAction intent="primary">GO</SheetAction>}
        footerNote="NOTE"
        footerStart={<SheetAction href="https://x.test">OPEN ↗</SheetAction>}
        hint="J / K · ESC"
        kind="PULL REQUEST · #1"
        onClose={() => {}}
        stateLabel="CI FAILING"
        title="Fix it"
        tone="error"
        {...geo}
      >
        <SheetBlock label="DESCRIPTION">
          <SheetText lines={["one", "two"]} />
        </SheetBlock>
      </AnchoredSheet>,
    );
    expect(screen.getByTestId(AnchoredSheetTestId.Kind)).toHaveTextContent("PULL REQUEST · #1");
    expect(screen.getByTestId(AnchoredSheetTestId.State)).toHaveTextContent("CI FAILING");
    expect(screen.getByTestId(AnchoredSheetTestId.Hint)).toHaveTextContent("J / K · ESC");
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Fix it");
    expect(screen.getAllByTestId(AnchoredSheetTestId.Chip)).toHaveLength(2);
    expect(screen.getAllByTestId(SheetPartsTestId.Text)).toHaveLength(2);
    expect(screen.getByTestId(AnchoredSheetTestId.FooterNote)).toHaveTextContent("NOTE");
    expect(screen.getByTestId(AnchoredSheetTestId.Root)).toHaveRole("dialog");
    expect(screen.getByTestId(AnchoredSheetTestId.Root)).toHaveAccessibleName("Fix it");
    expect(screen.getByTestId(AnchoredSheetTestId.Root).className).toContain("border-t-state-err");
  });

  it("applies geometry and the eraser strip", () => {
    render(<AnchoredSheet closeLabel="x" kind="k" onClose={() => {}} title="t" {...geo} />);
    const root = screen.getByTestId(AnchoredSheetTestId.Root);
    expect(root).toHaveStyle({ left: "100px", top: "0px", width: "500px", height: "700px" });
    expect(screen.getByTestId(AnchoredSheetTestId.Eraser)).toHaveStyle({
      left: "-2px",
      top: "40px",
      height: "30px",
    });
    expect(screen.queryByTestId(AnchoredSheetTestId.Footer)).toBeNull();
  });

  it("renders the title as an external link when titleHref is set", () => {
    render(
      <AnchoredSheet
        closeLabel="x"
        kind="k"
        onClose={() => {}}
        title="T"
        titleHref="https://x.test/1"
        {...geo}
      />,
    );
    const link = screen.getByTestId(AnchoredSheetTestId.TitleLink);
    expect(link).toHaveAttribute("href", "https://x.test/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName("T");
  });

  it("renders actions in the header", () => {
    render(
      <AnchoredSheet
        actions={<button type="button">Go</button>}
        closeLabel="x"
        kind="k"
        onClose={() => {}}
        title="t"
        {...geo}
      />,
    );
    const actions = screen.getByTestId(AnchoredSheetTestId.Actions);
    expect(screen.getByTestId(AnchoredSheetTestId.Header)).toContainElement(actions);
    expect(actions).toHaveTextContent("Go");
  });

  it("no actions container without actions", () => {
    render(<AnchoredSheet closeLabel="x" kind="k" onClose={() => {}} title="t" {...geo} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Actions)).toBeNull();
    expect(screen.queryByTestId(AnchoredSheetTestId.TitleLink)).toBeNull();
  });

  it("closes from the overlay and the × button", async () => {
    const onClose = vi.fn();
    render(<AnchoredSheet closeLabel="Close" kind="k" onClose={onClose} title="t" {...geo} />);
    await userEvent.click(screen.getByTestId(AnchoredSheetTestId.Overlay));
    await userEvent.click(screen.getByTestId(AnchoredSheetTestId.Close));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId(AnchoredSheetTestId.Close)).toHaveAccessibleName("Close");
  });
});

describe("SheetAction", () => {
  it("is a link when it has an href, a button otherwise", () => {
    const { rerender } = render(<SheetAction href="https://x.test">GH</SheetAction>);
    expect(screen.getByTestId(SheetPartsTestId.Action)).toHaveAttribute("href", "https://x.test");
    rerender(<SheetAction>BTN</SheetAction>);
    expect(screen.getByTestId(SheetPartsTestId.Action).tagName).toBe("BUTTON");
  });

  it("ignores clicks when disabled", async () => {
    const onClick = vi.fn();
    render(
      <SheetAction disabled onClick={onClick}>
        MERGE
      </SheetAction>,
    );
    const el = screen.getByTestId(SheetPartsTestId.Action);
    expect(el).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });
});
