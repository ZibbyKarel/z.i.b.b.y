import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  InstallExternalSkillDialog,
  InstallExternalSkillDialogTestId,
} from "./InstallExternalSkillDialog";

type Opts = { onSuccess?: (res: unknown) => void };

const { hooks } = vi.hoisted(() => ({
  hooks: {
    scan: vi.fn(),
    install: vi.fn(),
    scanError: null as unknown,
    installError: null as unknown,
  },
}));

vi.mock("../mutations", () => ({
  useScanExternalSkillsMutation: () => ({
    mutate: hooks.scan,
    isPending: false,
    isError: hooks.scanError !== null,
    error: hooks.scanError,
  }),
  useInstallExternalSkillsMutation: () => ({
    mutate: hooks.install,
    reset: vi.fn(),
    isPending: false,
    isError: hooks.installError !== null,
    error: hooks.installError,
  }),
}));

const URL = "https://github.com/cloudflare/skills";
const SCAN = {
  owner: "cloudflare",
  repo: "skills",
  sha: "abc",
  candidates: [
    { path: "security-audit", id: "security-audit", name: "Security audit", conflict: false },
    { path: "workers", id: "workers", name: "Workers", desc: "Deploy workers", conflict: false },
    { path: "deploy", id: "deploy", name: "Deploy", conflict: true },
  ],
};

describe("InstallExternalSkillDialog", () => {
  beforeEach(() => {
    hooks.scan.mockReset();
    hooks.install.mockReset();
    hooks.scanError = null;
    hooks.installError = null;
    hooks.scan.mockImplementation((_args, opts?: Opts) =>
      opts?.onSuccess?.({ status: 200, body: SCAN }),
    );
  });

  it("scans the pasted URL and lists candidates; a conflict is disabled with a reason", async () => {
    render(<InstallExternalSkillDialog onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId(InstallExternalSkillDialogTestId.Url), URL);
    await userEvent.click(screen.getByTestId(InstallExternalSkillDialogTestId.Scan));
    expect(hooks.scan).toHaveBeenCalledWith({ body: { url: URL } }, expect.anything());

    expect(
      screen.getByTestId(`${InstallExternalSkillDialogTestId.Candidate}-security-audit`),
    ).toBeEnabled();
    expect(
      screen.getByTestId(`${InstallExternalSkillDialogTestId.Candidate}-deploy`),
    ).toBeDisabled();
    expect(screen.getByTestId(InstallExternalSkillDialogTestId.Conflict)).toHaveTextContent(
      "deploy",
    );
  });

  it("Instalovat sends only the checked paths and closes on 201", async () => {
    const onClose = vi.fn();
    hooks.install.mockImplementation((_args, opts?: Opts) =>
      opts?.onSuccess?.({ status: 201, body: [] }),
    );
    render(<InstallExternalSkillDialog onClose={onClose} />);
    await userEvent.type(screen.getByTestId(InstallExternalSkillDialogTestId.Url), URL);
    await userEvent.click(screen.getByTestId(InstallExternalSkillDialogTestId.Scan));

    expect(screen.getByTestId(InstallExternalSkillDialogTestId.Submit)).toBeDisabled();
    await userEvent.click(
      screen.getByTestId(`${InstallExternalSkillDialogTestId.Candidate}-workers`),
    );
    await userEvent.click(screen.getByTestId(InstallExternalSkillDialogTestId.Submit));

    expect(hooks.install).toHaveBeenCalledWith(
      { body: { url: URL, paths: ["workers"] } },
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it.each([400, 422, 502])("shows the API message on a %i", (status) => {
    hooks.scanError = { status, body: { message: `boom ${status}` } };
    render(<InstallExternalSkillDialog onClose={vi.fn()} />);
    expect(screen.getByTestId(InstallExternalSkillDialogTestId.Error)).toHaveTextContent(
      `boom ${status}`,
    );
  });
});
