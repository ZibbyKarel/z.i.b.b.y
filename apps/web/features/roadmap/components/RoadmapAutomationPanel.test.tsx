import userEvent from "@testing-library/user-event";
import type { RoadmapConfigResponse } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { RoadmapAutomationPanel, RoadmapAutomationPanelTestId } from "./RoadmapAutomationPanel";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    config: {
      data: undefined as RoadmapConfigResponse | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    setConfig: { mutate: vi.fn(), isPending: false },
  },
}));

vi.mock("../queries", () => ({ useRoadmapConfigQuery: () => hooks.config }));
vi.mock("../mutations", () => ({ useSetRoadmapConfigMutation: () => hooks.setConfig }));

function config(partial: Partial<RoadmapConfigResponse> = {}): RoadmapConfigResponse {
  return {
    autoSync: null,
    autoPlay: null,
    effective: {
      autoSync: false,
      autoPlay: false,
      source: { autoSync: "global", autoPlay: "global" },
    },
    ...partial,
  };
}

const item = (testId: RoadmapAutomationPanelTestId, value: "inherit" | "on" | "off") =>
  within(screen.getByTestId(testId)).getByTestId(`segmented-control-item-${value}`);

describe("RoadmapAutomationPanel (tri-state)", () => {
  beforeEach(() => {
    hooks.config = { data: config(), isPending: false, isError: false, refetch: vi.fn() };
    hooks.setConfig = { mutate: vi.fn(), isPending: false };
  });

  it("reads null as Inherit and explicit booleans as On / Off", () => {
    hooks.config.data = config({ autoSync: true, autoPlay: false });
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(item(RoadmapAutomationPanelTestId.AutoSync, "on")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(item(RoadmapAutomationPanelTestId.AutoPlay, "off")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("selects Inherit for a null toggle and names the company as the source", () => {
    hooks.config.data = config({
      effective: {
        autoSync: true,
        autoPlay: false,
        source: { autoSync: "company", autoPlay: "global" },
      },
    });
    render(<RoadmapAutomationPanel companyName="Shoptet" projectId="proj-1" />);

    expect(item(RoadmapAutomationPanelTestId.AutoSync, "inherit")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoSyncEffective)).toHaveTextContent(
      "Shoptet",
    );
    expect(
      screen.getByTestId(RoadmapAutomationPanelTestId.AutoPlayEffective),
    ).not.toHaveTextContent("Shoptet");
  });

  it("patches ONLY the changed field, so the other toggle can't be clobbered", async () => {
    hooks.config.data = config({ autoPlay: true });
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(item(RoadmapAutomationPanelTestId.AutoSync, "on"));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { autoSync: true },
    });
  });

  it("saves Inherit as null", async () => {
    hooks.config.data = config({ autoPlay: true });
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(item(RoadmapAutomationPanelTestId.AutoPlay, "inherit"));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { autoPlay: null },
    });
  });

  it("ignores clicks while a write is in flight", async () => {
    hooks.setConfig.isPending = true;
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(item(RoadmapAutomationPanelTestId.AutoSync, "on"));

    expect(hooks.setConfig.mutate).not.toHaveBeenCalled();
  });

  it("surfaces a load failure instead of rendering toggles in a made-up state", () => {
    hooks.config = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(screen.queryByTestId(RoadmapAutomationPanelTestId.Root)).not.toBeInTheDocument();
  });
});
