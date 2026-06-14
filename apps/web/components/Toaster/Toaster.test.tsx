import { renderWithProviders as render, screen } from "../../test/render";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Toaster } from "./Toaster";
import { toastBus } from "./toastBus";

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
});
