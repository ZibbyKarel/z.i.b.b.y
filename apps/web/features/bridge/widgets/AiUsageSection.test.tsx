import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import { AiUsageSection, AiUsageSectionTestId } from "./AiUsageSection";

const d = vi.hoisted(() => ({
  limits: undefined as unknown,
  usage: undefined as unknown,
  engines: undefined as unknown,
  config: { aiEngine: "claude", modelFamily: "claude", opencodeModel: "" } as {
    aiEngine: string;
    modelFamily: string;
    opencodeModel: string;
  },
}));

vi.mock("../../limits/queries", () => ({ useLimitsQuery: () => ({ data: d.limits }) }));
vi.mock("../../ai-providers", () => ({
  useAiUsageQuery: () => ({ data: d.usage }),
  useAiEnginesQuery: () => ({ data: d.engines }),
}));
vi.mock("../../system", () => ({ useSystemConfigQuery: () => ({ data: d.config }) }));

const tokens = { input: 12_345, output: 2_000, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
const usage = (over: Record<string, unknown> = {}) => ({
  days: 30,
  opencode: {
    available: true,
    totals: { steps: 7, costUsd: 0, tokens },
    models: [
      { providerId: "opencode", modelId: "big-pickle", steps: 5, costUsd: 0, tokens },
      { providerId: "openai", modelId: "gpt-y", steps: 2, costUsd: 0.5, tokens },
    ],
    ...over,
  },
});

beforeEach(() => {
  d.limits = {
    rolling: { usedPct: 42, resetsAt: null },
    weekly: { usedPct: 7, resetsAt: null },
    capturedAt: null,
    stale: false,
  };
  d.usage = usage();
  d.engines = undefined;
  d.config = { aiEngine: "claude", modelFamily: "claude", opencodeModel: "opencode/big-pickle" };
});

describe("AiUsageSection", () => {
  it("shows Claude limits and opencode usage per model, free at zero cost, plus totals", () => {
    renderWithProviders(<AiUsageSection />);
    const claude = screen.getByTestId(AiUsageSectionTestId.Claude);
    expect(claude).toHaveTextContent("42%");
    expect(claude).toHaveTextContent("7%");
    expect(screen.getByTestId(AiUsageSectionTestId.ActiveModel)).toHaveTextContent(
      "opencode/big-pickle",
    );
    const [free, paid] = screen.getAllByTestId(AiUsageSectionTestId.ModelRow) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(free).toHaveTextContent("opencode/big-pickle");
    expect(free).toHaveTextContent("12,3 tis.");
    expect(within(free).getByTestId(AiUsageSectionTestId.Cost)).toHaveTextContent("zdarma");
    expect(within(paid).getByTestId(AiUsageSectionTestId.Cost)).toHaveTextContent("$0.50");
    expect(screen.getByTestId(AiUsageSectionTestId.Totals)).toHaveTextContent("7 kroků");
  });

  it("truncates a long model id (full id in the tooltip) and keeps the numbers visible", () => {
    d.usage = usage({
      models: [
        {
          providerId: "openrouter",
          modelId: "very-long-vendor/model-name-with-a-long-suffix",
          variant: "high",
          steps: 3,
          costUsd: 0,
          tokens,
        },
      ],
    });
    renderWithProviders(<AiUsageSection />);
    const row = screen.getByTestId(AiUsageSectionTestId.ModelRow);
    const id = "openrouter/very-long-vendor/model-name-with-a-long-suffix (high)";
    expect(row.querySelector(`[title="${id}"]`)).not.toBeNull();
    expect(row.querySelector(".truncate")).toHaveTextContent(id);
    expect(row).toHaveTextContent("3 kroků");
  });

  it("puts the global engine's block first; opencode first adds the Claude note", () => {
    const order = () =>
      screen
        .getAllByTestId(/^ai-usage-(claude|opencode)$/)
        .map((e) => e.getAttribute("data-testid"));
    const { unmount } = renderWithProviders(<AiUsageSection />);
    expect(order()).toEqual([AiUsageSectionTestId.Claude, AiUsageSectionTestId.Opencode]);
    expect(screen.queryByTestId(AiUsageSectionTestId.ClaudeNote)).not.toBeInTheDocument();
    unmount();
    d.config = { aiEngine: "opencode", modelFamily: "opencode", opencodeModel: "" };
    renderWithProviders(<AiUsageSection />);
    expect(order()).toEqual([AiUsageSectionTestId.Opencode, AiUsageSectionTestId.Claude]);
    expect(screen.getByTestId(AiUsageSectionTestId.ClaudeNote)).toHaveTextContent("claude-agent");
  });

  it("marks only the globally selected engine", () => {
    const { unmount } = renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(`${AiUsageSectionTestId.Global}-claude`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${AiUsageSectionTestId.Global}-opencode`)).not.toBeInTheDocument();
    unmount();
    d.config = { aiEngine: "opencode", modelFamily: "opencode", opencodeModel: "" };
    renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(`${AiUsageSectionTestId.Global}-opencode`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${AiUsageSectionTestId.Global}-claude`)).not.toBeInTheDocument();
  });

  it("the Claude family on opencode keeps the subscription limits first (A31)", () => {
    d.config = { aiEngine: "opencode", modelFamily: "claude", opencodeModel: "" };
    renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(`${AiUsageSectionTestId.Global}-claude`)).toBeInTheDocument();
  });

  it("says explicitly when opencode is not installed", () => {
    d.usage = usage({ available: false, models: [] });
    renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(AiUsageSectionTestId.Unavailable)).toBeInTheDocument();
    expect(screen.queryByTestId(AiUsageSectionTestId.ModelRow)).not.toBeInTheDocument();
  });

  it("says explicitly when nothing was used yet", () => {
    d.usage = usage({ models: [] });
    renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(AiUsageSectionTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(AiUsageSectionTestId.Totals)).not.toBeInTheDocument();
  });

  it("says limits are unknown before Claude reports any", () => {
    d.limits = undefined;
    renderWithProviders(<AiUsageSection />);
    expect(screen.getByTestId(AiUsageSectionTestId.Claude)).toHaveTextContent("Limity zatím");
  });
});
