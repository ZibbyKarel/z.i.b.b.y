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
    uninstall: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useExternalSkillUsagesQuery: () => ({ data: hooks.usages, isPending: false }),
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
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(onClose).toHaveBeenCalled();
    expect(hooks.uninstall).not.toHaveBeenCalled();
  });
});
