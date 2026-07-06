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
    render(
      <Dialog open title="Smazat">
        Opravdu?
      </Dialog>,
    );
    expect(screen.getByTestId(DialogTestId.Root)).toHaveRole("dialog");
    expect(screen.getByTestId(DialogTestId.Title)).toHaveTextContent("Smazat");
  });

  it("renders description when provided", () => {
    render(
      <Dialog open description="Toto nelze vrátit" title="Potvrzení">
        x
      </Dialog>,
    );
    expect(screen.getByTestId(DialogTestId.Description)).toHaveTextContent("Toto nelze vrátit");
  });

  it("renders actions slot", () => {
    render(
      <Dialog open actions={<button>OK</button>}>
        x
      </Dialog>,
    );
    const footer = screen.getByTestId(DialogTestId.Footer);
    expect(footer).toHaveTextContent("OK");
  });

  it("gives the full variant a definite height for a flex-1 canvas body", () => {
    render(
      <Dialog open width="full">
        x
      </Dialog>,
    );
    const root = screen.getByTestId(DialogTestId.Root);
    expect(root).toHaveStyle({ width: "1320px" });
    expect(root.style.height).not.toBe("");
  });

  it("fills the viewport when fullscreen, overriding width", () => {
    render(
      <Dialog fullscreen open width="md">
        x
      </Dialog>,
    );
    const root = screen.getByTestId(DialogTestId.Root);
    expect(root).toHaveStyle({ width: "calc(100vw - 32px)", height: "calc(100vh - 64px)" });
  });

  it("leaves non-full widths height-unset (hug content)", () => {
    render(
      <Dialog open width="md">
        x
      </Dialog>,
    );
    expect(screen.getByTestId(DialogTestId.Root).style.height).toBe("");
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        x
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives the dialog an accessible name from the title", () => {
    render(
      <Dialog open title="Smazat">
        x
      </Dialog>,
    );
    expect(screen.getByTestId(DialogTestId.Root)).toHaveAccessibleName("Smazat");
  });

  it("wires aria-describedby to the rendered description", () => {
    render(
      <Dialog open description="Toto nelze vrátit" title="Potvrzení">
        x
      </Dialog>,
    );
    const root = screen.getByTestId(DialogTestId.Root);
    expect(root).toHaveAccessibleDescription("Toto nelze vrátit");
  });

  it("lets an explicit ariaLabel override the title-derived name", () => {
    render(
      <Dialog open ariaLabel="Vlastní jméno" title={<span>Nikoli text</span>}>
        x
      </Dialog>,
    );
    expect(screen.getByTestId(DialogTestId.Root)).toHaveAccessibleName("Vlastní jméno");
  });

  it("traps Tab focus inside the dialog, wrapping from last to first", async () => {
    render(
      <Dialog
        open
        actions={
          <>
            <button>OK</button>
          </>
        }
        onClose={() => {}}
        title="Potvrzení"
      >
        <button>Confirm</button>
      </Dialog>,
    );
    const closeButton = screen.getByTestId(DialogTestId.CloseButton);
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

  it("traps Shift+Tab focus, wrapping from first to last", async () => {
    render(
      <Dialog
        open
        actions={
          <>
            <button>OK</button>
          </>
        }
        onClose={() => {}}
        title="Potvrzení"
      >
        <button>Confirm</button>
      </Dialog>,
    );
    const closeButton = screen.getByTestId(DialogTestId.CloseButton);
    const okButton = screen.getByRole("button", { name: "OK" });

    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(okButton);
  });
});
