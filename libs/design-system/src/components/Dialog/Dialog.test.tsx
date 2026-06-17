import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Dialog, DialogTestId } from "./Dialog";

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(<Dialog open={false}>Obsah</Dialog>);
    expect(screen.queryByTestId(DialogTestId.Root)).toBeNull();
  });

  it("renders the dialog panel when open", () => {
    render(<Dialog open title="Smazat">Opravdu?</Dialog>);
    expect(screen.getByTestId(DialogTestId.Root)).toHaveRole("dialog");
    expect(screen.getByTestId(DialogTestId.Title)).toHaveTextContent("Smazat");
  });

  it("renders description when provided", () => {
    render(<Dialog open description="Toto nelze vrátit" title="Potvrzení">x</Dialog>);
    expect(screen.getByTestId(DialogTestId.Description)).toHaveTextContent("Toto nelze vrátit");
  });

  it("renders actions slot", () => {
    render(<Dialog open actions={<button>OK</button>}>x</Dialog>);
    const footer = screen.getByTestId(DialogTestId.Footer);
    expect(footer).toHaveTextContent("OK");
  });

  it("gives the full variant a definite height for a flex-1 canvas body", () => {
    render(<Dialog open width="full">x</Dialog>);
    const root = screen.getByTestId(DialogTestId.Root);
    expect(root).toHaveStyle({ width: "1320px" });
    expect(root.style.height).not.toBe("");
  });

  it("leaves non-full widths height-unset (hug content)", () => {
    render(<Dialog open width="md">x</Dialog>);
    expect(screen.getByTestId(DialogTestId.Root).style.height).toBe("");
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose}>x</Dialog>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
