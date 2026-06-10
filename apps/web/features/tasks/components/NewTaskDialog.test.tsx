import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * The catalog queries hit no server in tests, so they resolve empty and the
 * classifier falls back to the ZIBBY target — enough to exercise the full
 * compose → classifying → routing → dispatched gate without a backend.
 */
describe("NewTaskDialog", () => {
  it("renders as a labelled modal dialog on the compose step", () => {
    render(<NewTaskDialog classifyDelayMs={0} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zařadit & spustit/ })).toBeInTheDocument();
  });

  it("surfaces detected paths as removable context chips", async () => {
    render(<NewTaskDialog classifyDelayMs={0} onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/Zadání/),
      "Srovnej média v ~/Projects/media-vault",
    );
    const remove = screen.getByRole("button", {
      name: "Odebrat cestu ~/Projects/media-vault",
    });
    expect(remove).toBeInTheDocument();
    await userEvent.click(remove);
    expect(
      screen.queryByRole("button", { name: /Odebrat cestu/ }),
    ).not.toBeInTheDocument();
  });

  it("is approval-first: routing shows Dispatch but nothing runs until it is clicked", async () => {
    render(<NewTaskDialog classifyDelayMs={0} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByRole("button", { name: /Zařadit & spustit/ }));

    // Routing (approval) stage — Dispatch is present, but the task is not yet dispatched.
    const dispatch = await screen.findByRole("button", { name: /Dispatch/ });
    expect(dispatch).toBeInTheDocument();
    expect(screen.getByText(/Nic se nespustí/)).toBeInTheDocument();
    expect(screen.queryByText("Task předán")).not.toBeInTheDocument();

    await userEvent.click(dispatch);
    expect(screen.getByText("Task předán")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Otevřít běhy/ })).toBeInTheDocument();
  });

  it("opens the manual override picker from the routing stage", async () => {
    render(<NewTaskDialog classifyDelayMs={0} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "udělej něco");
    await userEvent.click(screen.getByRole("button", { name: /Zařadit & spustit/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Změnit cíl/ }));
    expect(screen.getByText("Vyber cíl ručně")).toBeInTheDocument();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog classifyDelayMs={0} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Zrušit/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
