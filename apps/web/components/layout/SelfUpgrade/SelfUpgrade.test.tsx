import userEvent from "@testing-library/user-event";
import type { SelfStatus } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { SelfUpgrade, SelfUpgradeTestId } from "./SelfUpgrade";

const { statusRef } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
}));

vi.mock("../../../features/self", () => ({
  useSelfStatusQuery: () => ({ data: statusRef.value }),
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
  appVersion: "0.2.1",
  appUpdateAvailable: false,
};

const UPDATE: SelfStatus = {
  ...BASE,
  latestAppVersion: "0.3.0",
  latestAppReleaseUrl: "https://github.com/ZibbyKarel/z.i.b.b.y/releases/tag/desktop-v0.3.0",
  appUpdateAvailable: true,
};

describe("SelfUpgrade", () => {
  beforeEach(() => {
    statusRef.value = BASE;
  });
  afterEach(() => {
    delete window.zibbyDesktop;
    vi.restoreAllMocks();
  });

  it("is hidden when no newer release exists", () => {
    renderWithProviders(<SelfUpgrade />);
    expect(screen.queryByTestId(SelfUpgradeTestId.Button)).not.toBeInTheDocument();
  });

  it("is hidden while the status is unknown", () => {
    statusRef.value = undefined;
    renderWithProviders(<SelfUpgrade />);
    expect(screen.queryByTestId(SelfUpgradeTestId.Button)).not.toBeInTheDocument();
  });

  it("renders an icon-only button named after the newer version", () => {
    statusRef.value = UPDATE;
    renderWithProviders(<SelfUpgrade />);
    const button = screen.getByTestId(SelfUpgradeTestId.Button);
    expect(button).toHaveTextContent("");
    expect(button).toHaveAccessibleName("Aktualizovat ZibbyOS na v0.3.0");
    expect(button).toHaveAttribute("title", "Aktualizovat ZibbyOS na v0.3.0");
  });

  it("runs the desktop updater when the preload bridge is present", async () => {
    statusRef.value = UPDATE;
    const checkForUpdates = vi.fn().mockResolvedValue(undefined);
    window.zibbyDesktop = { checkForUpdates };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the release page in a new tab in a plain browser", async () => {
    statusRef.value = UPDATE;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(<SelfUpgrade />);
    await userEvent.click(screen.getByTestId(SelfUpgradeTestId.Button));
    expect(open).toHaveBeenCalledWith(UPDATE.latestAppReleaseUrl, "_blank", "noopener,noreferrer");
  });
});
