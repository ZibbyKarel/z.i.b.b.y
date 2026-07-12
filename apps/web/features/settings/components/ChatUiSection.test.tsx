import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownTestId } from "@zibby/design-system";
import {
  type SpeechStatus,
  type SpeechVoice,
  type SystemConfig,
  SystemConfigSchema,
} from "@zibby/contracts";
import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import { ChatUiSection, ChatUiSectionTestId } from "./ChatUiSection";

let config: SystemConfig = SystemConfigSchema.parse({});
const setConfig = vi.fn();

const VOICES: SpeechVoice[] = [
  { id: "cs-jarvis", label: "Jarvis (CS)", language: "cs", gender: "male", source: "piper", license: "MIT" },
];
const READY_STATUS: SpeechStatus = {
  reachable: true,
  state: "ready",
  engine: "piper",
  model: "cs-jarvis-medium",
  device: "cpu",
  defaultVoice: "cs-jarvis",
  queueDepth: 0,
  uptimeS: 120,
};

const voicesRefetch = vi.fn();
let voicesResult: { data?: SpeechVoice[]; isError: boolean } = { data: VOICES, isError: false };
let statusResult: { data?: SpeechStatus } = { data: READY_STATUS };

vi.mock("../../system/queries", () => ({ useSystemConfigQuery: () => ({ data: config }) }));
vi.mock("../../system/mutations", () => ({
  useSetSystemConfigMutation: () => ({ mutate: setConfig, isPending: false }),
}));
vi.mock("../../speech/queries", () => ({
  useSpeechVoicesQuery: () => ({ ...voicesResult, refetch: voicesRefetch }),
  useSpeechStatusQuery: () => statusResult,
}));

beforeEach(() => {
  setConfig.mockReset();
  voicesRefetch.mockReset();
  config = SystemConfigSchema.parse({});
  voicesResult = { data: VOICES, isError: false };
  statusResult = { data: READY_STATUS };
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

  describe("voice picker (Phase 119c)", () => {
    it("offers Auto plus every speakd voice", async () => {
      render(<ChatUiSection />);
      await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
      const labels = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);
      expect(labels).toEqual(["Automaticky (výchozí od daemonu)", "csJarvis (CS)"]);
    });

    it("picking a voice PUTs the whole config with only ttsVoice changed", async () => {
      render(<ChatUiSection />);
      await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
      const opt = screen
        .getAllByTestId(DropdownTestId.Option)
        .find((o) => o.textContent?.includes("Jarvis"));
      await userEvent.click(opt!);
      expect(setConfig).toHaveBeenCalledWith({ body: { ...config, ttsVoice: "cs-jarvis" } });
    });

    it("picking Auto sets ttsVoice back to null", async () => {
      config = SystemConfigSchema.parse({ ttsVoice: "cs-jarvis" });
      render(<ChatUiSection />);
      await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
      const opt = screen
        .getAllByTestId(DropdownTestId.Option)
        .find((o) => o.textContent?.startsWith("Automaticky"));
      await userEvent.click(opt!);
      expect(setConfig).toHaveBeenCalledWith({ body: { ...config, ttsVoice: null } });
    });

    it("shows the degraded note instead of the picker when the voice catalog fails to load", () => {
      voicesResult = { data: undefined, isError: true };
      render(<ChatUiSection />);
      expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
      expect(screen.queryByTestId(DropdownTestId.Trigger)).not.toBeInTheDocument();
    });

    it("retrying the degraded note refetches the voice catalog", async () => {
      voicesResult = { data: undefined, isError: true };
      render(<ChatUiSection />);
      await userEvent.click(screen.getByTestId(LoadErrorTestId.Retry));
      expect(voicesRefetch).toHaveBeenCalled();
    });
  });

  describe("daemon status line (Phase 119c)", () => {
    it("shows the ready state and default voice when reachable", () => {
      render(<ChatUiSection />);
      expect(screen.getByTestId(ChatUiSectionTestId.VoiceStatus)).toHaveTextContent(
        "speakd: připraven · výchozí hlas cs-jarvis",
      );
    });

    it("shows the unreachable message when the daemon is down — even if voices also errored", () => {
      voicesResult = { data: undefined, isError: true };
      statusResult = {
        data: { ...READY_STATUS, reachable: false, state: "degraded", defaultVoice: null },
      };
      render(<ChatUiSection />);
      expect(screen.getByTestId(ChatUiSectionTestId.VoiceStatus)).toHaveTextContent(
        "speakd: nedostupný",
      );
      // The picker degrades independently of the status line.
      expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    });

    it("renders nothing while the status query hasn't resolved yet", () => {
      statusResult = { data: undefined };
      render(<ChatUiSection />);
      expect(screen.queryByTestId(ChatUiSectionTestId.VoiceStatus)).not.toBeInTheDocument();
    });
  });
});
