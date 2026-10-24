import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SelfStatus } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { SelfUpgrade, SelfUpgradeTestId } from "./SelfUpgrade";

const { statusRef, mutateMock } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
  mutateMock: vi.fn(),
}));

vi.mock("../../../features/self", async () => ({
  ...(await vi.importActual<typeof import("../../../features/self/updateErrorMessage")>(
    "../../../features/self/updateErrorMessage",
  )),
  useSelfStatusQuery: () => ({ data: statusRef.value }),
  useSelfUpdateMutation: () => ({ mutate: mutateMock, isPending: false }),
}));

const BASE: SelfStatus = {
  currentBranch: "main",
  defaultBranch: "main",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: true,
};

type Options = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };

describe("SelfUpgrade", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    statusRef.value = BASE;
  });
  afterEach(() => vi.useRealTimers());

  it("is hidden when not a git install", () => {
    statusRef.value = { ...BASE, currentBranch: "" };
    renderWithProviders(<SelfUpgrade />);
    expect(screen.queryByTestId(SelfUpgradeTestId.Button)).not.toBeInTheDocument();
  });

  it("shows the behind count", () => {
    statusRef.value = { ...BASE, behind: 3, upToDate: false };
    renderWithProviders(<SelfUpgrade />);
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveTextContent("↓3");
  });

  it("accessible name starts with the visible word and describes branch + behind", () => {
    statusRef.value = { ...BASE, behind: 3, upToDate: false };
    renderWithProviders(<SelfUpgrade />);
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveAccessibleName(
      "Upgrade — aktualizovat ZIBBY (větev main, 3 za origin)",
    );
  });

  it("dirty accessible name still starts with the visible word", () => {
    statusRef.value = { ...BASE, dirty: true };
    renderWithProviders(<SelfUpgrade />);
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveAccessibleName(/^Upgrade — /);
  });

  it("has an always-mounted polite live region", () => {
    renderWithProviders(<SelfUpgrade />);
    const region = screen.getByTestId(SelfUpgradeTestId.Status);
    expect(region).toHaveRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
  });

  it("is disabled with a dirty title when the tree is dirty", () => {
    statusRef.value = { ...BASE, dirty: true };
    renderWithProviders(<SelfUpgrade />);
    const button = screen.getByTestId(SelfUpgradeTestId.Button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Neuložené změny — aktualizace zablokována");
  });

  it("updates on click and announces Updated / Up to date in the live region", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    expect(mutateMock).toHaveBeenCalledWith({ body: {} }, expect.any(Object));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    act(() => options.onSuccess?.({ status: 200, body: { updated: true, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Status)).toHaveTextContent("Aktualizováno");
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveAccessibleName(/^Upgrade/);
    act(() => options.onSuccess?.({ status: 200, body: { updated: false, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Status)).toHaveTextContent("Aktuální");
  });

  it("clears the Updated announcement after 5 s", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    vi.useFakeTimers();
    act(() => options.onSuccess?.({ status: 200, body: { updated: true, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Status)).toHaveTextContent("Aktualizováno");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId(SelfUpgradeTestId.Status)).toBeEmptyDOMElement();
  });

  it("shows the 409 server message inline", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    act(() => options.onError?.({ status: 409, body: { message: "dirty" } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Error)).toHaveTextContent("dirty");
    expect(screen.getByTestId(SelfUpgradeTestId.Status)).toContainElement(
      screen.getByTestId(SelfUpgradeTestId.Error),
    );
  });
});
