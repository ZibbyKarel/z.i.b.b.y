import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { RoadmapAutomationPanel, RoadmapAutomationPanelTestId } from "./RoadmapAutomationPanel";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    config: {
      data: undefined as { autoSync: boolean; autoPlay: boolean } | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    setConfig: { mutate: vi.fn(), isPending: false },
  },
}));

vi.mock("../queries", () => ({ useRoadmapConfigQuery: () => hooks.config }));
vi.mock("../mutations", () => ({ useSetRoadmapConfigMutation: () => hooks.setConfig }));

describe("RoadmapAutomationPanel", () => {
  beforeEach(() => {
    hooks.config = {
      data: { autoSync: false, autoPlay: false },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    hooks.setConfig = { mutate: vi.fn(), isPending: false };
  });

  it("reflects the stored config on both toggles", () => {
    hooks.config.data = { autoSync: true, autoPlay: false };
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoSync)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoPlay)).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("sends ONLY the flipped field, so the other toggle can't be clobbered", async () => {
    // The regression this guards: a full-config PUT built from local state would
    // ship `autoPlay: false` alongside, silently switching auto-implement off.
    hooks.config.data = { autoSync: false, autoPlay: true };
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(RoadmapAutomationPanelTestId.AutoSync));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { autoSync: true },
    });
  });

  it("toggling auto-implement patches autoPlay alone", async () => {
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(screen.getByTestId(RoadmapAutomationPanelTestId.AutoPlay));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { autoPlay: true },
    });
  });

  it("locks both toggles while a write is in flight", () => {
    hooks.setConfig.isPending = true;
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoSync)).toBeDisabled();
    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoPlay)).toBeDisabled();
  });

  it("surfaces a load failure instead of rendering toggles in a made-up state", () => {
    hooks.config = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(screen.queryByTestId(RoadmapAutomationPanelTestId.Root)).not.toBeInTheDocument();
  });
});
