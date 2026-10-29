import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorChannelSettings, OperatorChannelStatus } from "@zibby/contracts";
import { OperatorChannelSection, OperatorChannelSectionTestId } from "./OperatorChannelSection";

const SETTINGS: OperatorChannelSettings = {
  enabled: true,
  transport: "slack",
  operatorUserIds: ["U123"],
  dmChannelId: "D-SERVER",
  locale: "cs",
  notify: { events: ["pr-opened", "ci-red"], maxPerHour: 20 },
  allowSlackApprovals: false,
};
const STATUS: OperatorChannelStatus = {
  enabled: true,
  transport: "slack",
  mode: "fake",
  credentials: { bot: true, app: false },
  connected: true,
  listening: false,
  workspace: "Zibby's",
  dmResolved: true,
};

let settings: OperatorChannelSettings = SETTINGS;
const save = vi.fn();
const test = vi.fn();

vi.mock("../../operator-channel", () => ({
  useOperatorChannelSettingsQuery: () => ({ data: settings }),
  useOperatorChannelStatusQuery: () => ({ data: STATUS }),
  useSetOperatorChannelSettingsMutation: () => ({ mutate: save, isPending: false }),
  useTestOperatorChannelMutation: () => ({ mutate: test, isPending: false, data: undefined }),
}));

beforeEach(() => {
  save.mockReset();
  test.mockReset();
  settings = SETTINGS;
});

describe("OperatorChannelSection", () => {
  it("reflects the enabled switch and the per-event toggles", () => {
    render(<OperatorChannelSection />);
    expect(screen.getByTestId(OperatorChannelSectionTestId.Enabled)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(`${OperatorChannelSectionTestId.Event}-pr-opened`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(`${OperatorChannelSectionTestId.Event}-briefing`)).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("toggling an event PUTs the full settings without the server-owned dmChannelId", async () => {
    render(<OperatorChannelSection />);
    await userEvent.click(screen.getByTestId(`${OperatorChannelSectionTestId.Event}-briefing`));
    const body = save.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("dmChannelId");
    expect(body).toMatchObject({ notify: { events: ["pr-opened", "ci-red", "briefing"] } });
  });

  it("the top-right test button sends a test message", async () => {
    render(<OperatorChannelSection />);
    await userEvent.click(screen.getByTestId(OperatorChannelSectionTestId.Test));
    expect(test).toHaveBeenCalledTimes(1);
  });

  it("disables the test button and event toggles while the channel is off", () => {
    settings = { ...SETTINGS, enabled: false };
    render(<OperatorChannelSection />);
    expect(screen.getByTestId(OperatorChannelSectionTestId.Test)).toBeDisabled();
    expect(screen.getByTestId(`${OperatorChannelSectionTestId.Event}-ci-red`)).toBeDisabled();
  });
});
