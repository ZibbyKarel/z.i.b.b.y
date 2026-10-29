import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import {
  UninstallExternalSkillDialog,
  UninstallExternalSkillDialogTestId,
} from "./UninstallExternalSkillDialog";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    usages: [] as unknown[],
    usagesError: null as unknown,
    uninstall: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useExternalSkillUsagesQuery: () => ({
    data: hooks.usagesError ? undefined : hooks.usages,
    isPending: false,
    isError: hooks.usagesError !== null,
    error: hooks.usagesError,
  }),
}));
vi.mock("../mutations", () => ({
  useUninstallExternalSkillMutation: () => ({
    mutate: hooks.uninstall,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const T = UninstallExternalSkillDialogTestId;

describe("UninstallExternalSkillDialog", () => {
  beforeEach(() => {
    hooks.uninstall.mockReset();
    hooks.usages = [];
    hooks.usagesError = null;
  });

  it("on success fires onUninstalled, then closes", async () => {
    const onClose = vi.fn();
    const onUninstalled = vi.fn();
    hooks.uninstall.mockImplementation((_a, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(
      <UninstallExternalSkillDialog
        name="Security audit"
        onClose={onClose}
        onUninstalled={onUninstalled}
        skillId="sa"
      />,
    );
    await userEvent.click(screen.getByTestId(T.Submit));
    expect(onUninstalled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("a failed usages query shows the error and never submits", () => {
    hooks.usagesError = { status: 404, body: { message: "not an external skill" } };
    render(<UninstallExternalSkillDialog name="Security audit" onClose={vi.fn()} skillId="sa" />);
    expect(screen.getByTestId(T.UsagesError)).toHaveTextContent("not an external skill");
    expect(screen.getByTestId(T.Submit)).toBeDisabled();
  });

  it("without usages is a plain confirm that sends an empty decision map", async () => {
    render(<UninstallExternalSkillDialog name="Security audit" onClose={vi.fn()} skillId="sa" />);
    expect(screen.queryByTestId(`${T.Usage}-wf1`)).toBeNull();
    await userEvent.click(screen.getByTestId(T.Submit));
    expect(hooks.uninstall).toHaveBeenCalledWith(
      { params: { id: "sa" }, body: { workflows: {} } },
      expect.anything(),
    );
  });

  it("with usages needs a decision per workflow before submit", async () => {
    hooks.usages = [
      { workflowId: "wf1", name: "Audit flow", phaseIds: ["p1"] },
      { workflowId: "wf2", name: "Release", phaseIds: ["p2", "p3"] },
    ];
    render(<UninstallExternalSkillDialog name="Security audit" onClose={vi.fn()} skillId="sa" />);
    const submit = screen.getByTestId(T.Submit);
    expect(submit).toBeDisabled();

    await userEvent.click(
      within(screen.getByTestId(`${T.Usage}-wf1`)).getByRole("radio", {
        name: "Smazat celý workflow",
      }),
    );
    expect(submit).toBeDisabled();
    await userEvent.click(
      within(screen.getByTestId(`${T.Usage}-wf2`)).getByRole("radio", { name: "Odebrat jen krok" }),
    );
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(hooks.uninstall).toHaveBeenCalledWith(
      { params: { id: "sa" }, body: { workflows: { wf1: "workflow", wf2: "step" } } },
      expect.anything(),
    );
  });

  it("Zrušit closes without sending anything", async () => {
    const onClose = vi.fn();
    render(<UninstallExternalSkillDialog name="Security audit" onClose={onClose} skillId="sa" />);
    const cancel = screen.getByTestId(T.Cancel);
    expect(cancel).toHaveAccessibleName("Zrušit");
    await userEvent.click(cancel);
    expect(onClose).toHaveBeenCalled();
    expect(hooks.uninstall).not.toHaveBeenCalled();
  });
});
