import userEvent from "@testing-library/user-event";
import { type AiEngineStatus, type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { OperatorTokenNoticeTestId } from "../../ai-providers/components/OperatorTokenNotice";
import { AiEngineSection, AiEngineSectionTestId } from "./AiEngineSection";

let config: SystemConfig;
let engines: AiEngineStatus[];
let setError: unknown = null;
const setConfig = vi.fn();

vi.mock("../../system/queries", () => ({ useSystemConfigQuery: () => ({ data: config }) }));
vi.mock("../../system/mutations", () => ({
  useSetSystemConfigMutation: () => ({
    mutate: setConfig,
    isPending: false,
    isError: setError !== null,
    error: setError,
  }),
}));
vi.mock("../../ai-providers/queries", () => ({
  useAiEnginesQuery: () => ({ data: { engines } }),
}));

const opencode = (over: Partial<AiEngineStatus> = {}): AiEngineStatus => ({
  id: "opencode",
  available: true,
  version: "1.2.3",
  providers: [],
  models: [
    { id: "anthropic/claude-x", free: false },
    { id: "opencode/big-pickle", free: true },
  ],
  ...over,
});

beforeEach(() => {
  setConfig.mockReset();
  setError = null;
  config = SystemConfigSchema.parse({});
  engines = [{ id: "claude", available: true, version: "2.0.0" }, opencode()];
});

describe("AiEngineSection", () => {
  it("shows availability and version of both engines", () => {
    render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.ClaudeStatus)).toHaveTextContent("2.0.0");
    expect(screen.getByTestId(AiEngineSectionTestId.OpencodeStatus)).toHaveTextContent("1.2.3");
  });

  it("refuses opencode while no model is chosen and says why", async () => {
    render(<AiEngineSection />);
    await userEvent.click(screen.getByTestId("button-group-option-opencode"));
    expect(setConfig).not.toHaveBeenCalled();
    expect(screen.getByTestId(AiEngineSectionTestId.Blocked)).toHaveTextContent("model");
  });

  it("refuses opencode when the binary is missing or the model vanished", async () => {
    engines = [opencode({ available: false, version: undefined })];
    const { unmount } = render(<AiEngineSection />);
    await userEvent.click(screen.getByTestId("button-group-option-opencode"));
    expect(setConfig).not.toHaveBeenCalled();
    expect(screen.getByTestId(AiEngineSectionTestId.Blocked)).toBeInTheDocument();
    unmount();

    engines = [opencode()];
    config = { ...config, opencodeModel: "gone/model" };
    render(<AiEngineSection />);
    await userEvent.click(screen.getByTestId("button-group-option-opencode"));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("spread-PUTs aiEngine once a listed model is chosen", async () => {
    config = { ...config, opencodeModel: "opencode/big-pickle" };
    render(<AiEngineSection />);
    expect(screen.queryByTestId(AiEngineSectionTestId.Blocked)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-group-option-opencode"));
    expect(setConfig).toHaveBeenCalledWith({ body: { ...config, aiEngine: "opencode" } });
  });

  it("choosing a model spread-PUTs opencodeModel", async () => {
    render(<AiEngineSection />);
    await userEvent.click(screen.getByTestId("dropdown-trigger"));
    await userEvent.click(screen.getAllByTestId("dropdown-option")[0] as HTMLElement);
    expect(setConfig).toHaveBeenCalledWith({
      body: { ...config, opencodeModel: "opencode/big-pickle" },
    });
  });

  it("with no connected provider hints at opencode auth login; with some lists them", () => {
    const { unmount } = render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.NoProviders)).toHaveTextContent(
      "opencode auth login",
    );
    unmount();
    engines = [opencode({ providers: ["openai"] })];
    render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.Providers)).toHaveTextContent("openai");
    expect(screen.queryByTestId(AiEngineSectionTestId.NoProviders)).not.toBeInTheDocument();
  });

  it("a 401 shows the operator-token notice with a link; the switch stays on the server value", () => {
    setError = { status: 401 };
    render(<AiEngineSection />);
    expect(screen.getByTestId(OperatorTokenNoticeTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(OperatorTokenNoticeTestId.Link)).toHaveAttribute(
      "href",
      "/system/settings/general",
    );
    expect(screen.getByTestId("button-group-option-claude")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("any other failure shows the generic message, not the token notice", () => {
    setError = { status: 500 };
    render(<AiEngineSection />);
    expect(screen.queryByTestId(OperatorTokenNoticeTestId.Root)).not.toBeInTheDocument();
  });

  it("hides the picker when opencode is not installed", () => {
    engines = [opencode({ available: false, version: undefined })];
    render(<AiEngineSection />);
    expect(screen.queryByTestId("dropdown-trigger")).not.toBeInTheDocument();
  });
});
