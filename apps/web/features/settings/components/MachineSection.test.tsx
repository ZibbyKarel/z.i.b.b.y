import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineConfig } from "@zibby/contracts";
import { MachineSection, MachineSectionTestId } from "./MachineSection";

const DEFAULTS: MachineConfig = { cloneRoot: "/Users/karel/Projects" };

let config: MachineConfig = { ...DEFAULTS };
const setConfig = vi.fn();

vi.mock("../../machine", () => ({
  useMachineConfigQuery: () => ({ data: config }),
  useUpdateMachineConfigMutation: () => ({ mutate: setConfig, isPending: false }),
}));

beforeEach(() => {
  setConfig.mockReset();
  config = { ...DEFAULTS };
});

describe("MachineSection", () => {
  it("seeds the clone-root field from the loaded config", () => {
    render(<MachineSection />);
    expect(screen.getByTestId(MachineSectionTestId.CloneRoot)).toHaveValue("/Users/karel/Projects");
  });

  it("saves the edited clone root", async () => {
    render(<MachineSection />);
    const input = screen.getByTestId(MachineSectionTestId.CloneRoot);
    await userEvent.clear(input);
    await userEvent.type(input, "/Volumes/data/zibby-clones");
    await userEvent.click(screen.getByTestId(MachineSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { cloneRoot: "/Volumes/data/zibby-clones" } });
  });

  it("disables Save when the field is cleared", async () => {
    render(<MachineSection />);
    await userEvent.clear(screen.getByTestId(MachineSectionTestId.CloneRoot));
    expect(screen.getByTestId(MachineSectionTestId.Save)).toBeDisabled();
  });
});
