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
  limitResumeMax: 3,
  maxConcurrentRuns: null,
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
    expect(screen.getByTestId(SystemSectionTestId.TaskTick)).toHaveValue(30000);
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

  it("coerces a cleared tick to 0 (disabled)", async () => {
    render(<SystemSection />);
    await userEvent.clear(screen.getByTestId(SystemSectionTestId.TaskTick));
    await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, taskTickMs: 0 } });
  });

  describe("maxConcurrentRuns (125c) — nullable knob", () => {
    it("renders empty when the loaded config has no global cap (null)", () => {
      render(<SystemSection />);
      expect(screen.getByTestId(SystemSectionTestId.MaxConcurrentRuns)).toHaveValue(null);
    });

    it("seeds the control from a loaded numeric cap", () => {
      config = { ...DEFAULTS, maxConcurrentRuns: 4 };
      render(<SystemSection />);
      expect(screen.getByTestId(SystemSectionTestId.MaxConcurrentRuns)).toHaveValue(4);
    });

    it("Save round-trips a set cap unchanged", async () => {
      config = { ...DEFAULTS, maxConcurrentRuns: 4 };
      render(<SystemSection />);
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxConcurrentRuns: 4 } });
    });

    it("Save PUTs a newly-typed cap", async () => {
      render(<SystemSection />);
      const field = screen.getByTestId(SystemSectionTestId.MaxConcurrentRuns);
      await userEvent.type(field, "8");
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxConcurrentRuns: 8 } });
    });

    it("clearing a set cap round-trips as null (no cap), never coerced to the min", async () => {
      config = { ...DEFAULTS, maxConcurrentRuns: 4 };
      render(<SystemSection />);
      await userEvent.clear(screen.getByTestId(SystemSectionTestId.MaxConcurrentRuns));
      await userEvent.click(screen.getByTestId(SystemSectionTestId.Save));
      expect(setConfig).toHaveBeenCalledWith({ body: { ...DEFAULTS, maxConcurrentRuns: null } });
    });
  });
});
