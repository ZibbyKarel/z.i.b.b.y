import { UsagePanel, UsagePanelTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { useHeaderLimitItems } from "./useHeaderLimitItems";

const d = vi.hoisted(() => ({
  limits: undefined as unknown,
  config: undefined as unknown,
  usage: undefined as unknown,
}));

vi.mock("../../../features/limits", () => ({ useLimitsQuery: () => ({ data: d.limits }) }));
vi.mock("../../../features/system", () => ({ useSystemConfigQuery: () => ({ data: d.config }) }));
vi.mock("../../../features/ai-providers", () => ({
  AI_USAGE_DAYS: 30,
  useAiUsageQuery: () => ({ data: d.usage }),
}));

const model = (
  providerId: string,
  modelId: string,
  costUsd: number,
  input: number,
  output = 0,
) => ({
  providerId,
  modelId,
  costUsd,
  steps: 1,
  tokens: { input, output, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
});

function Probe() {
  return <UsagePanel items={useHeaderLimitItems()} />;
}

beforeEach(() => {
  d.limits = {
    rolling: { usedPct: 42, resetsAt: null },
    weekly: { usedPct: 7, resetsAt: null },
  };
  d.usage = {
    days: 30,
    opencode: {
      available: true,
      models: [
        model("openai", "gpt-5", 1.24, 300_000, 112_000),
        model("opencode", "big-pickle", 0, 1_000),
        model("bluecode", "glm", 0, 5_000),
      ],
    },
  };
});

describe("useHeaderLimitItems", () => {
  it("claude family shows the 5H and week rings", () => {
    d.config = { aiEngine: "opencode", modelFamily: "claude" };
    renderWithProviders(<Probe />);
    expect(screen.getAllByTestId(UsagePanelTestId.Value).map((v) => v.textContent)).toEqual([
      "42%",
      "7%",
    ]);
    expect(screen.queryByTestId(UsagePanelTestId.Stat)).not.toBeInTheDocument();
  });

  it("legacy native Claude engine keeps the rings whatever the family", () => {
    d.config = { aiEngine: "claude", modelFamily: "openai" };
    renderWithProviders(<Probe />);
    expect(screen.getAllByTestId(UsagePanelTestId.Ring)).toHaveLength(2);
  });

  it("openai shows its own 30-day cost and tokens as stats", () => {
    d.config = { aiEngine: "opencode", modelFamily: "openai" };
    renderWithProviders(<Probe />);
    expect(screen.queryByTestId(UsagePanelTestId.Ring)).not.toBeInTheDocument();
    expect(screen.getAllByTestId(UsagePanelTestId.Label).map((l) => l.textContent)).toEqual([
      "Cena 30 d",
      "Tokeny",
    ]);
    const tokens = new Intl.NumberFormat("cs", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(412_000);
    expect(screen.getAllByTestId(UsagePanelTestId.Stat).map((s) => s.textContent)).toEqual([
      "$1.24",
      tokens,
    ]);
  });

  it("opencode at zero cost reads free; bluecode at zero cost reads a dash", () => {
    d.config = { aiEngine: "opencode", modelFamily: "opencode" };
    const { unmount } = renderWithProviders(<Probe />);
    expect(screen.getAllByTestId(UsagePanelTestId.Stat)[0]).toHaveTextContent("zdarma");
    unmount();
    d.config = { aiEngine: "opencode", modelFamily: "bluecode" };
    renderWithProviders(<Probe />);
    expect(screen.getAllByTestId(UsagePanelTestId.Stat)[0]).toHaveTextContent("—");
  });

  it("usage not loaded shows dashes", () => {
    d.config = { aiEngine: "opencode", modelFamily: "openai" };
    d.usage = undefined;
    renderWithProviders(<Probe />);
    expect(screen.getAllByTestId(UsagePanelTestId.Stat).map((s) => s.textContent)).toEqual([
      "—",
      "—",
    ]);
  });
});
