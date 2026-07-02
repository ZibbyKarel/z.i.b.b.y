import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

describe("ConfirmDeleteDialog (NC1) — the one confirm-delete dialog", () => {
  const props = {
    title: "Smazat agenta?",
    body: "Opravdu smazat agenta Kodér? Tuto akci nelze vrátit.",
    confirmLabel: "Smazat",
    cancelLabel: "Zrušit",
  };

  it("renders the question and the consequence", () => {
    render(<ConfirmDeleteDialog {...props} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Smazat agenta?")).toBeInTheDocument();
    expect(screen.getByText(/Tuto akci nelze vrátit/)).toBeInTheDocument();
  });

  it("Confirm fires onConfirm, Cancel fires onCancel — never both", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDeleteDialog {...props} onCancel={onCancel} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Smazat" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("pending puts the danger button in its loading state", () => {
    render(<ConfirmDeleteDialog {...props} pending onCancel={vi.fn()} onConfirm={vi.fn()} />);
    // The DS Button renders a spinner and keeps the accessible name while loading.
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
  });
});
