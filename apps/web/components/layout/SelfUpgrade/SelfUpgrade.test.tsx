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

  it("describes branch and behind in the aria-label", () => {
    statusRef.value = { ...BASE, behind: 3, upToDate: false };
    renderWithProviders(<SelfUpgrade />);
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveAccessibleName(/main.*3/);
  });

  it("is disabled with a dirty title when the tree is dirty", () => {
    statusRef.value = { ...BASE, dirty: true };
    renderWithProviders(<SelfUpgrade />);
    const button = screen.getByTestId(SelfUpgradeTestId.Button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Neuložené změny — aktualizace zablokována");
  });

  it("updates on click and shows Updated / Up to date", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    expect(mutateMock).toHaveBeenCalledWith({ body: {} }, expect.any(Object));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    act(() => options.onSuccess?.({ status: 200, body: { updated: true, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveTextContent("Aktualizováno");
    act(() => options.onSuccess?.({ status: 200, body: { updated: false, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveTextContent("Aktuální");
  });

  it("reverts the Updated label after 5 s", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    vi.useFakeTimers();
    act(() => options.onSuccess?.({ status: 200, body: { updated: true, behind: 0 } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveTextContent("Aktualizováno");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId(SelfUpgradeTestId.Button)).toHaveTextContent("Upgrade");
  });

  it("shows the 409 server message inline", async () => {
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    const options = mutateMock.mock.calls[0]?.[1] as Options;
    act(() => options.onError?.({ status: 409, body: { message: "dirty" } }));
    expect(screen.getByTestId(SelfUpgradeTestId.Error)).toHaveTextContent("dirty");
  });
});
