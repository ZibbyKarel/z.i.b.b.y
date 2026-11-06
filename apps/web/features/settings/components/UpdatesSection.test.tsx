import userEvent from "@testing-library/user-event";
import type { SelfStatus } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cs from "../../../i18n/messages/cs.json";
import { renderWithProviders, screen } from "../../../test/render";
import { UpdatesSection, UpdatesSectionTestId } from "./UpdatesSection";

const { statusRef, checkMock } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
  checkMock: vi.fn(),
}));

vi.mock("../../self", () => ({
  useSelfStatusQuery: () => ({ data: statusRef.value }),
  useCheckAppUpdateMutation: () => ({ mutate: checkMock, isPending: false }),
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
  appVersion: "0.3.0",
  latestAppVersion: "0.3.0",
  appUpdateAvailable: false,
};

const UPDATE: SelfStatus = {
  ...BASE,
  latestAppVersion: "0.4.0",
  latestAppReleaseUrl: "https://github.com/o/r/releases/tag/desktop-v0.4.0",
  appUpdateAvailable: true,
};

type Options = { onSuccess?: (r: { body: SelfStatus }) => void };

describe("UpdatesSection", () => {
  beforeEach(() => {
    checkMock.mockReset();
    statusRef.value = BASE;
  });
  afterEach(() => {
    delete window.zibbyDesktop;
  });

  it("shows the current version and no install button when up to date", () => {
    renderWithProviders(<UpdatesSection />);
    expect(screen.getByTestId(UpdatesSectionTestId.Root)).toHaveTextContent("v0.3.0");
    expect(screen.queryByTestId(UpdatesSectionTestId.Available)).not.toBeInTheDocument();
    expect(screen.queryByTestId(UpdatesSectionTestId.Install)).not.toBeInTheDocument();
  });

  it("check reports up to date after a fresh lookup", async () => {
    checkMock.mockImplementation((_vars: unknown, opts: Options) => opts.onSuccess?.({ body: BASE }));
    renderWithProviders(<UpdatesSection />);
    await userEvent.click(screen.getByTestId(UpdatesSectionTestId.Check));
    expect(checkMock).toHaveBeenCalledWith({ body: {} }, expect.anything());
    expect(screen.getByTestId(UpdatesSectionTestId.Status)).toHaveTextContent(
      cs.settings.updates.upToDate,
    );
  });

  it("check reports a failure when the release lookup came back empty", async () => {
    checkMock.mockImplementation((_vars: unknown, opts: Options) =>
      opts.onSuccess?.({ body: { ...BASE, latestAppVersion: undefined } }),
    );
    renderWithProviders(<UpdatesSection />);
    await userEvent.click(screen.getByTestId(UpdatesSectionTestId.Check));
    expect(screen.getByTestId(UpdatesSectionTestId.Status)).toHaveTextContent(
      cs.settings.updates.failed,
    );
  });

  it("an available update is named and installs through the desktop bridge", async () => {
    statusRef.value = UPDATE;
    const installUpdate = vi.fn().mockResolvedValue(undefined);
    window.zibbyDesktop = { checkForUpdates: vi.fn(), installUpdate };
    renderWithProviders(<UpdatesSection />);
    expect(screen.getByTestId(UpdatesSectionTestId.Available)).toHaveTextContent("v0.4.0");
    await userEvent.click(screen.getByTestId(UpdatesSectionTestId.Install));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("in a plain browser install opens the release page", async () => {
    statusRef.value = UPDATE;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(<UpdatesSection />);
    await userEvent.click(screen.getByTestId(UpdatesSectionTestId.Install));
    expect(open).toHaveBeenCalledWith(UPDATE.latestAppReleaseUrl, "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
