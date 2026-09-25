import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Sheet, SheetTestId } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    render(<Sheet open={false}>Obsah</Sheet>);
    expect(screen.queryByTestId(SheetTestId.Root)).toBeNull();
  });

  it("renders the panel when open, anchored right by default", () => {
    render(
      <Sheet open title="Approval · APR-142">
        Detail
      </Sheet>,
    );
    const root = screen.getByTestId(SheetTestId.Root);
    expect(root).toHaveRole("dialog");
    expect(root).toHaveAttribute("data-side", "right");
    expect(screen.getByTestId(SheetTestId.Title)).toHaveTextContent("Approval · APR-142");
  });

  it("renders children in the body", () => {
    render(<Sheet open>Detail content</Sheet>);
    expect(screen.getByTestId(SheetTestId.Body)).toHaveTextContent("Detail content");
  });

  it("renders the footer slot", () => {
    render(<Sheet open footer={<button>Approve</button>} />);
    expect(screen.getByTestId(SheetTestId.Footer)).toHaveTextContent("Approve");
  });

  it("gives the sheet an accessible name from the title", () => {
    render(<Sheet open title="Pipeline editor" />);
    expect(screen.getByTestId(SheetTestId.Root)).toHaveAccessibleName("Pipeline editor");
  });

  it("lets an explicit ariaLabel override the title-derived name", () => {
    render(
      <Sheet open ariaLabel="Vlastní jméno" title={<span>Nikoli text</span>}>
        x
      </Sheet>,
    );
    expect(screen.getByTestId(SheetTestId.Root)).toHaveAccessibleName("Vlastní jméno");
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        x
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the overlay backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        x
      </Sheet>,
    );
    await userEvent.click(screen.getByTestId(SheetTestId.Overlay));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the panel itself is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Detail">
        x
      </Sheet>,
    );
    await userEvent.click(screen.getByTestId(SheetTestId.Root));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps Tab focus inside the sheet, wrapping from last to first", async () => {
    render(
      <Sheet open footer={<button>OK</button>} onClose={() => {}} title="Approval">
        <button>Confirm</button>
      </Sheet>,
    );
    const closeButton = screen.getByTestId(SheetTestId.CloseButton);
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    const okButton = screen.getByRole("button", { name: "OK" });

    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    await userEvent.tab();
    expect(document.activeElement).toBe(confirmButton);

    await userEvent.tab();
    expect(document.activeElement).toBe(okButton);

    await userEvent.tab();
    expect(document.activeElement).toBe(closeButton);
  });

  it("only the most-recently-opened sheet reacts to Escape when two are open at once", async () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(
      <>
        <Sheet open onClose={onCloseOuter} title="Outer">
          outer
        </Sheet>
        <Sheet open onClose={onCloseInner} title="Inner">
          inner
        </Sheet>
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onCloseInner).toHaveBeenCalledOnce();
    expect(onCloseOuter).not.toHaveBeenCalled();
  });
});
