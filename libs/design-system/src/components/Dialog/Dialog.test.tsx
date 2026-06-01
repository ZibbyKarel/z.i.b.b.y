import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Dialog } from "./Dialog";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    wrap(<Dialog open={false}>Obsah</Dialog>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog panel when open", () => {
    wrap(<Dialog open title="Smazat">Opravdu?</Dialog>);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Smazat")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    wrap(<Dialog open title="Potvrzení" description="Toto nelze vrátit">x</Dialog>);
    expect(screen.getByText("Toto nelze vrátit")).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    wrap(<Dialog open actions={<button>OK</button>}>x</Dialog>);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    wrap(<Dialog open onClose={onClose}>x</Dialog>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
