import { renderWithProviders as render, screen } from "../../test/render";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Toaster, ToasterTestId } from "./Toaster";
import cs from "../../i18n/messages/cs.json";
import { emitMutationError, toastBus } from "./toastBus";

const ERROR_CS = "Akce se nepovedla — změna se neuložila. Zkus to prosím znovu.";

describe("Toaster (43) — surfaces mutation errors", () => {
  it("renders the localized mutation error when the bus emits with no message", () => {
    render(<Toaster />);
    act(() => toastBus.emit());
    expect(screen.getByText(ERROR_CS)).toBeInTheDocument();
  });

  it("dismisses a toast when its close button is pressed", async () => {
    render(<Toaster />);
    act(() => toastBus.emit());
    expect(screen.getByText(ERROR_CS)).toBeInTheDocument();
    // The toast's only button is the alert's close (X).
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByText(ERROR_CS)).not.toBeInTheDocument();
  });

  it("is anchored top-right, not bottom", () => {
    render(<Toaster />);
    act(() => toastBus.emit());
    const root = screen.getByTestId(ToasterTestId.Root);
    expect(root.style.top).toBe("1rem");
    expect(root.style.bottom).toBe("");
  });

  it("a 401 mutation error shows the operator-token message, anything else the generic one", () => {
    render(<Toaster />);
    act(() => emitMutationError({ status: 401, body: { message: "no" } }));
    expect(screen.getByText(cs.approvals.operatorTokenMissing)).toBeInTheDocument();
    act(() => emitMutationError(new Error("boom")));
    expect(screen.getByText(ERROR_CS)).toBeInTheDocument();
  });
});
