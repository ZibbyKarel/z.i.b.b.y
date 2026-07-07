import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pins } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import { QuickLaunchPanel, QuickLaunchPanelTestId } from "./QuickLaunchPanel";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    pins: [] as Pins,
    toggle: vi.fn(),
    openNewTask: vi.fn(),
    agents: [] as { id: string; name?: string; glyph?: string; avatar?: string }[],
    pipelines: [] as { id: string; name?: string; avatar?: string }[],
    chains: [] as { id: string; name?: string }[],
  },
}));

vi.mock("../../../pins", () => ({
  usePinToggle: () => ({ pins: hooks.pins, toggle: hooks.toggle }),
}));
vi.mock("../../../agents", () => ({ useAgentsQuery: () => ({ data: hooks.agents }) }));
vi.mock("../../../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));
vi.mock("../../../chains", () => ({ useChainsQuery: () => ({ data: hooks.chains }) }));
vi.mock("../../../tasks", () => ({ useNewTask: () => ({ open: hooks.openNewTask }) }));

describe("QuickLaunchPanel", () => {
  beforeEach(() => {
    hooks.toggle.mockReset();
    hooks.openNewTask.mockReset();
    hooks.pins = [];
    hooks.agents = [{ id: "researcher", name: "Researcher", glyph: "bot" }];
    hooks.pipelines = [{ id: "delivery", name: "Delivery" }];
    hooks.chains = [{ id: "research-then-build", name: "Research → Build" }];
  });

  it("renders nothing when there are no pins", () => {
    render(<QuickLaunchPanel />);
    expect(screen.queryByText("Panel rychlého spuštění")).not.toBeInTheDocument();
    expect(screen.queryByTestId(QuickLaunchPanelTestId.Row)).not.toBeInTheDocument();
  });

  it("renders a row per resolved pin (agent/pipeline/chain)", () => {
    hooks.pins = [
      { kind: "agent", id: "researcher" },
      { kind: "pipeline", id: "delivery" },
      { kind: "chain", id: "research-then-build" },
    ];
    render(<QuickLaunchPanel />);
    expect(screen.getAllByTestId(QuickLaunchPanelTestId.Row)).toHaveLength(3);
    expect(screen.getByText("Researcher")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Research → Build")).toBeInTheDocument();
  });

  it("silently drops a pin whose entity was deleted", () => {
    hooks.pins = [
      { kind: "agent", id: "researcher" },
      { kind: "agent", id: "ghost" },
    ];
    render(<QuickLaunchPanel />);
    expect(screen.getAllByTestId(QuickLaunchPanelTestId.Row)).toHaveLength(1);
  });

  it("RUN on an agent/pipeline opens the New Task dialog with the prefilled target", async () => {
    hooks.pins = [{ kind: "pipeline", id: "delivery" }];
    render(<QuickLaunchPanel />);
    await userEvent.click(screen.getByTestId(QuickLaunchPanelTestId.Run));
    expect(hooks.openNewTask).toHaveBeenCalledWith(undefined, {
      kind: "pipeline",
      id: "delivery",
      name: "Delivery",
      glyph: "flow",
    });
  });

  it("RUN on a chain also opens the dialog (phase-05: chain is a normal target)", async () => {
    hooks.pins = [{ kind: "chain", id: "research-then-build" }];
    render(<QuickLaunchPanel />);
    await userEvent.click(screen.getByTestId(QuickLaunchPanelTestId.Run));
    expect(hooks.openNewTask).toHaveBeenCalledWith(undefined, {
      kind: "chain",
      id: "research-then-build",
      name: "Research → Build",
      glyph: "link",
    });
  });

  it("shows the entity avatar on the pin card when the agent has one", () => {
    hooks.agents = [
      { id: "researcher", name: "Researcher", glyph: "bot", avatar: "/avatars/coder.png" },
    ];
    hooks.pins = [{ kind: "agent", id: "researcher" }];
    render(<QuickLaunchPanel />);
    expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute("src", "/avatars/coder.png");
  });

  it("unpin calls toggle with the item removed", async () => {
    hooks.pins = [{ kind: "agent", id: "researcher" }];
    render(<QuickLaunchPanel />);
    await userEvent.click(screen.getByTestId(QuickLaunchPanelTestId.Unpin));
    expect(hooks.toggle).toHaveBeenCalledWith("agent", "researcher");
  });
});
