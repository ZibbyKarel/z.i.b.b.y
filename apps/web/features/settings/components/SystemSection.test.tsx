import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemConfig } from "@zibby/contracts";
import { SystemSection, SystemSectionTestId } from "./SystemSection";

const DEFAULTS: SystemConfig = {
  taskTickMs: 30000,
  channelTickMs: 30000,
  monitorTickMs: 60000,
  automationTickMs: 0,
  limitResumeTickMs: 60000,
  roadmapTickMs: 60000,
  limitResumeMax: 3,
  maxWorkingAgents: 3,
  dockDoneTasksLimit: 20,
  goalVerifyTimeoutMs: 600000,
  goalAutoResume: false,
  chatPersona: "jarvis",
  powerSaver: false,
  ttsVoice: null,
};

let config: SystemConfig = { ...DEFAULTS };
const setConfig = vi.fn();

vi.mock("../../system/queries", () => ({ useSystemConfigQuery: () => ({ data: config }) }));
vi.mock("../../system/mutations", () => ({
  useSetSystemConfigMutation: () => ({ mutate: setConfig, isPending: false }),
}));

beforeEach(() => {
  setConfig.mockReset();
  config = { ...DEFAULTS };
});

describe("SystemSection", () => {
  it("seeds the controls from the loaded config", () => {
    render(<SystemSection />);
    // 30 s displays rounded up to 1 min — never as 0 (= off).
    expect(screen.getByTestId(`${SystemSectionTestId.TaskTick}-minutes`)).toHaveValue(1);
    expect(screen.getByTestId(`${SystemSectionTestId.GoalVerifyTimeout}-minutes`)).toHaveValue(10);
    expect(screen.getByTestId(SystemSectionTestId.LimitResumeMax)).toHaveValue(3);
  });

  it("Save PUTs the whole config with an edited numeric knob", async () => {
    render(<SystemSection />);
    const max = screen.getByTestId(SystemSectionTestId.LimitResumeMax);
    await userEvent.clear(max);
    await userEvent.type(max, "5");
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, limitResumeMax: 5 } });
  });

  it("Save reflects a flipped goalAutoResume toggle", async () => {
    render(<SystemSection />);
    await userEvent.click(screen.getByTestId(SystemSectionTestId.GoalAutoResume));
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, goalAutoResume: true } });
  });

  it("round-trips an untouched sub-minute tick unchanged", async () => {
    render(<SystemSection />);
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: DEFAULTS });
  });

  it("coerces a cleared tick to 0 (disabled)", async () => {
    render(<SystemSection />);
    await userEvent.clear(screen.getByTestId(`${SystemSectionTestId.TaskTick}-minutes`));
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, taskTickMs: 0 } });
  });

  it("Save PUTs an edited roadmapTickMs (125h) — 1 min → 1 h 1 min", async () => {
    render(<SystemSection />);
    await userEvent.type(screen.getByTestId(`${SystemSectionTestId.RoadmapTick}-hours`), "1");
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, roadmapTickMs: 3_660_000 } });
  });

  it("edits the channel tick in hours (twice a day = 12 h)", async () => {
    render(<SystemSection />);
    await userEvent.clear(screen.getByTestId(`${SystemSectionTestId.ChannelTick}-minutes`));
    await userEvent.type(screen.getByTestId(`${SystemSectionTestId.ChannelTick}-hours`), "12");
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, channelTickMs: 43_200_000 } });
  });

  it("re-splits overflowing minutes (90 min → 1 h 30 min)", async () => {
    render(<SystemSection />);
    const minutes = screen.getByTestId(`${SystemSectionTestId.MonitorTick}-minutes`);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, "90");
    expect(screen.getByTestId(`${SystemSectionTestId.MonitorTick}-hours`)).toHaveValue(1);
    expect(minutes).toHaveValue(30);
  });

  describe("maxWorkingAgents — the machine fuse", () => {
    it("seeds the control from the loaded fuse (default 3)", () => {
      render(<SystemSection />);
      expect(screen.getByTestId(SystemSectionTestId.MaxWorkingAgents)).toHaveValue(3);
    });

    it("Save round-trips a set fuse unchanged", async () => {
      config = { ...DEFAULTS, maxWorkingAgents: 4 };
      render(<SystemSection />);
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxWorkingAgents: 4 } });
    });

    it("Save PUTs a newly-typed fuse", async () => {
      render(<SystemSection />);
      const field = screen.getByTestId(SystemSectionTestId.MaxWorkingAgents);
      await userEvent.clear(field);
      await userEvent.type(field, "8");
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxWorkingAgents: 8 } });
    });

    it("a cleared fuse is clamped to the minimum of 1 — the fuse always exists", async () => {
      config = { ...DEFAULTS, maxWorkingAgents: 4 };
      render(<SystemSection />);
      await userEvent.clear(screen.getByTestId(SystemSectionTestId.MaxWorkingAgents));
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxWorkingAgents: 1 } });
    });
  });
});
