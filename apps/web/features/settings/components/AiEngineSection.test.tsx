import userEvent from "@testing-library/user-event";
import { type AiEngineStatus, type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
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
    { id: "anthropic/claude-x", free: false, subscription: false, variants: [] },
    { id: "opencode/big-pickle", free: true, subscription: false, variants: [] },
  ],
  ...over,
});

beforeEach(() => {
  setConfig.mockReset();
  setError = null;
  config = SystemConfigSchema.parse({});
  engines = [{ id: "claude", available: true, version: "2.0.0" }, opencode()];
});

const ids = (...models: string[]) =>
  models.map((id) => ({ id, free: false, subscription: false, variants: [] }));

describe("AiEngineSection", () => {
  it("shows that everything runs on opencode, with its version, and no engine toggle", () => {
    render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.OpencodeStatus)).toHaveTextContent("1.2.3");
    expect(screen.queryByTestId("ai-engine-switch")).not.toBeInTheDocument();
  });

  it("picking a family writes aiEngine, tiers and default filtered by the catalog", async () => {
    engines = [
      opencode({
        providers: ["opencode"],
        models: ids("claude-agent/haiku", "claude-agent/sonnet", "opencode/glm-5.3-flash-free"),
      }),
    ];
    config = { ...config, aiEngine: "claude", modelFamily: "opencode" };
    render(<AiEngineSection />);
    await userEvent.click(screen.getByTestId("button-group-option-claude"));
    expect(setConfig).toHaveBeenCalledWith({
      body: {
        ...config,
        aiEngine: "opencode",
        modelFamily: "claude",
        opencodeModel: "claude-agent/sonnet",
        // opus / fable are not in the catalog: left unset
        opencodeTierModels: { haiku: "claude-agent/haiku", sonnet: "claude-agent/sonnet" },
      },
    });
  });

  it("a family whose provider is not connected is not applied and shows the login command", async () => {
    render(<AiEngineSection />); // catalog has no openai/* model
    expect(screen.getByTestId(`${AiEngineSectionTestId.FamilyHint}-openai`)).toHaveTextContent(
      "opencode auth login openai",
    );
    await userEvent.click(screen.getByTestId("button-group-option-openai"));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("writes the unfiltered preset and says so when the catalog is unreadable", async () => {
    engines = [opencode({ models: [] })];
    render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.Unchecked)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-group-option-openai"));
    expect(setConfig).toHaveBeenCalledWith({
      body: expect.objectContaining({
        modelFamily: "openai",
        aiEngine: "opencode",
        opencodeModel: "openai/gpt-6.1-terra",
      }),
    });
  });

  it("says when the opencode binary is missing", () => {
    engines = [opencode({ available: false, version: undefined })];
    render(<AiEngineSection />);
    expect(screen.getByTestId(AiEngineSectionTestId.Blocked)).toBeInTheDocument();
  });

  it("choosing a model spread-PUTs opencodeModel", async () => {
    render(<AiEngineSection />);
    // the first picker is the default model
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0] as HTMLElement);
    await userEvent.click(await screen.findByRole("option", { name: /big-pickle/ }));
    expect(setConfig).toHaveBeenCalledWith({
      body: { ...config, opencodeModel: "opencode/big-pickle" },
    });
  });

  it("maps a level to an opencode model, and clearing it drops the key", async () => {
    config = { ...config, opencodeTierModels: { opus: "anthropic/claude-x" } };
    render(<AiEngineSection />);
    const level = (tier: string) => screen.getByTestId(`${AiEngineSectionTestId.Level}-${tier}`);
    expect(screen.getByTestId(AiEngineSectionTestId.Levels)).toBeInTheDocument();
    await userEvent.click(within(level("haiku")).getByTestId("dropdown-trigger"));
    await userEvent.click(await screen.findByRole("option", { name: /big-pickle/ }));
    expect(setConfig).toHaveBeenLastCalledWith({
      body: {
        ...config,
        opencodeTierModels: { opus: "anthropic/claude-x", haiku: "opencode/big-pickle" },
      },
    });
    await userEvent.click(within(level("opus")).getByTestId("dropdown-trigger"));
    await userEvent.click(await screen.findByRole("option", { name: "— žádný —" }));
    expect(setConfig).toHaveBeenLastCalledWith({ body: { ...config, opencodeTierModels: {} } });
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
    ); // modelFamily default
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
