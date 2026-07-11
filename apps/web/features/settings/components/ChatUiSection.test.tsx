import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { ChatUiSection, ChatUiSectionTestId } from "./ChatUiSection";

let config: SystemConfig = SystemConfigSchema.parse({});
const setConfig = vi.fn();

vi.mock("../../system/queries", () => ({ useSystemConfigQuery: () => ({ data: config }) }));
vi.mock("../../system/mutations", () => ({
  useSetSystemConfigMutation: () => ({ mutate: setConfig, isPending: false }),
}));

beforeEach(() => {
  setConfig.mockReset();
  config = SystemConfigSchema.parse({});
});

describe("ChatUiSection", () => {
  it("defaults the power-saver toggle to off", () => {
    render(<ChatUiSection />);
    expect(screen.getByTestId(ChatUiSectionTestId.PowerSaverToggle)).toHaveAccessibleName(
      "Úsporný mód",
    );
    expect(screen.getByTestId(ChatUiSectionTestId.PowerSaverToggle)).toHaveRole("switch");
  });

  it("toggling PUTs the whole config with only powerSaver changed", async () => {
    render(<ChatUiSection />);
    await userEvent.click(screen.getByTestId(ChatUiSectionTestId.PowerSaverToggle));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...config, powerSaver: true } });
  });
});
