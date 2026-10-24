import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SelfStatus } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { SelfDevelopmentPanel, SelfDevelopmentPanelTestId } from "./SelfDevelopmentPanel";

const { statusRef, ensureMock, pushMock } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
  ensureMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("../../self", async () => ({
  ...(await vi.importActual<typeof import("../../self/updateErrorMessage")>(
    "../../self/updateErrorMessage",
  )),
  useSelfStatusQuery: () => ({ data: statusRef.value }),
  useEnsureSelfProjectMutation: () => ({ mutate: ensureMock, isPending: false }),
}));

const BASE: SelfStatus = {
  currentBranch: "main",
  defaultBranch: "main",
  behind: 2,
  ahead: 1,
  dirty: false,
  upToDate: false,
  openPrCount: 2,
  prs: [
    { number: 12, title: "Fix the thing", url: "https://github.com/o/r/pull/12" },
    { number: 13, title: "Add feature", url: "https://github.com/o/r/pull/13" },
  ],
  ghAvailable: true,
};

type Options = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };

describe("SelfDevelopmentPanel", () => {
  beforeEach(() => {
    ensureMock.mockReset();
    pushMock.mockReset();
    statusRef.value = BASE;
  });

  it("renders branch, behind/ahead, dirty and PR links", () => {
    renderWithProviders(<SelfDevelopmentPanel />);
    expect(screen.getByTestId(SelfDevelopmentPanelTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("↓2 / ↑1")).toBeInTheDocument();
    const links = screen.getAllByTestId(SelfDevelopmentPanelTestId.PrLink);
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://github.com/o/r/pull/12");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noreferrer");
    expect(links[0]).toHaveRole("link");
  });

  it("warns when the self project points at the running install", () => {
    statusRef.value = { ...BASE, projectId: "zibby-self", projectUsesInstallTree: true };
    renderWithProviders(<SelfDevelopmentPanel />);
    expect(screen.getByTestId(SelfDevelopmentPanelTestId.InstallTreeWarning)).toHaveTextContent(
      "Projekt ZIBBY ukazuje přímo na běžící instalaci — runbook (Builder ≠ Subject) doporučuje samostatný klon. Uprav cestu projektu.",
    );
  });

  it("shows no install-tree warning for a separate clone", () => {
    statusRef.value = { ...BASE, projectId: "zibby", projectUsesInstallTree: false };
    renderWithProviders(<SelfDevelopmentPanel />);
    expect(
      screen.queryByTestId(SelfDevelopmentPanelTestId.InstallTreeWarning),
    ).not.toBeInTheDocument();
  });

  it("with a projectId the action opens the project without ensuring", async () => {
    statusRef.value = { ...BASE, projectId: "zibby" };
    renderWithProviders(<SelfDevelopmentPanel />);
    await userEvent.click(screen.getByTestId(SelfDevelopmentPanelTestId.Action));
    expect(pushMock).toHaveBeenCalledWith("/projects/zibby");
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("without a projectId the action ensures then navigates", async () => {
    renderWithProviders(<SelfDevelopmentPanel />);
    await userEvent.click(screen.getByTestId(SelfDevelopmentPanelTestId.Action));
    expect(ensureMock).toHaveBeenCalledWith({ body: {} }, expect.any(Object));
    const options = ensureMock.mock.calls[0]?.[1] as Options;
    act(() => options.onSuccess?.({ status: 200, body: { projectId: "zibby", created: true } }));
    expect(pushMock).toHaveBeenCalledWith("/projects/zibby");
  });

  it("shows a 409 message inline", async () => {
    renderWithProviders(<SelfDevelopmentPanel />);
    await userEvent.click(screen.getByTestId(SelfDevelopmentPanelTestId.Action));
    const options = ensureMock.mock.calls[0]?.[1] as Options;
    act(() => options.onError?.({ status: 409, body: { message: "no origin" } }));
    expect(screen.getByTestId(SelfDevelopmentPanelTestId.Error)).toHaveTextContent("no origin");
    const region = screen.getByTestId(SelfDevelopmentPanelTestId.Status);
    expect(region).toHaveRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toContainElement(screen.getByTestId(SelfDevelopmentPanelTestId.Error));
  });

  it("is hidden when not a git install", () => {
    statusRef.value = { ...BASE, currentBranch: "" };
    renderWithProviders(<SelfDevelopmentPanel />);
    expect(screen.queryByTestId(SelfDevelopmentPanelTestId.Root)).not.toBeInTheDocument();
  });
});
