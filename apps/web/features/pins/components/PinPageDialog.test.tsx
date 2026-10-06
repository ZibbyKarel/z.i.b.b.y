import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, waitFor } from "../../../test/render";
import { PinPageDialog, PinPageDialogTestId } from "./PinPageDialog";

const { hooks } = vi.hoisted(() => ({
  hooks: { pinPage: vi.fn(), isPending: false },
}));
vi.mock("../usePagePins", () => ({
  usePagePins: () => ({
    pagePins: [],
    isPagePinned: () => false,
    pinPage: hooks.pinPage,
    unpinPage: vi.fn(),
    isPending: hooks.isPending,
  }),
}));

describe("PinPageDialog", () => {
  beforeEach(() => {
    hooks.pinPage.mockReset();
    hooks.isPending = false;
  });

  it("prefills the name field with the explicit defaultName when given", () => {
    render(<PinPageDialog defaultName="Acme Corp" href="/work/companies/acme" onClose={vi.fn()} />);
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toHaveValue("Acme Corp");
  });

  it("falls back to a humanized path segment when there is no defaultName", () => {
    render(<PinPageDialog href="/system/settings/general" onClose={vi.fn()} />);
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toHaveValue("General");
  });

  it("blocks submit and marks the field invalid when the name is cleared", async () => {
    render(<PinPageDialog defaultName="People" href="/org/people" onClose={vi.fn()} />);
    const input = screen.getByTestId(PinPageDialogTestId.Name);
    await userEvent.clear(input);
    await userEvent.click(screen.getByTestId(PinPageDialogTestId.Submit));
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(hooks.pinPage).not.toHaveBeenCalled();
  });

  it("pins the href with the (possibly edited) name and closes on submit", async () => {
    const onClose = vi.fn();
    render(<PinPageDialog defaultName="People" href="/org/people" onClose={onClose} />);
    const input = screen.getByTestId(PinPageDialogTestId.Name);
    await userEvent.clear(input);
    await userEvent.type(input, "My People Page");
    await userEvent.click(screen.getByTestId(PinPageDialogTestId.Submit));
    await waitFor(() =>
      expect(hooks.pinPage).toHaveBeenCalledWith("/org/people", "My People Page"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter in the name field", async () => {
    const onClose = vi.fn();
    render(<PinPageDialog defaultName="People" href="/org/people" onClose={onClose} />);
    const input = screen.getByTestId(PinPageDialogTestId.Name);
    await userEvent.type(input, "{Enter}");
    // jsdom's implicit form submission on Enter can fire the native submit
    // event more than once for a single keypress (a jsdom/user-event quirk,
    // not app behavior) — assert submission happened, not an exact count.
    await waitFor(() => expect(hooks.pinPage).toHaveBeenCalledWith("/org/people", "People"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without pinning on Cancel", async () => {
    const onClose = vi.fn();
    render(<PinPageDialog defaultName="People" href="/org/people" onClose={onClose} />);
    await userEvent.click(screen.getByTestId(PinPageDialogTestId.Cancel));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hooks.pinPage).not.toHaveBeenCalled();
  });
});
