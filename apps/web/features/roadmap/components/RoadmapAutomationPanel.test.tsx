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
    autoPlay: null,
    autoReview: null,
    autoAddressComments: null,
    effective: {
      autoPlay: false,
      autoReview: false,
      autoAddressComments: false,
      source: {
        autoPlay: "global",
        autoReview: "global",
        autoAddressComments: "global",
      },
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
    hooks.config.data = config({ autoReview: true, autoPlay: false });
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(item(RoadmapAutomationPanelTestId.AutoReview, "on")).toHaveAttribute(
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
        autoPlay: true,
        autoReview: false,
        autoAddressComments: false,
        source: {
          autoPlay: "company",
          autoReview: "global",
          autoAddressComments: "global",
        },
      },
    });
    render(<RoadmapAutomationPanel companyName="Shoptet" projectId="proj-1" />);

    expect(item(RoadmapAutomationPanelTestId.AutoPlay, "inherit")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoPlayEffective)).toHaveTextContent(
      "Shoptet",
    );
    expect(
      screen.getByTestId(RoadmapAutomationPanelTestId.AutoReviewEffective),
    ).not.toHaveTextContent("Shoptet");
  });

  it("patches ONLY the changed field, so the other toggle can't be clobbered", async () => {
    hooks.config.data = config({ autoPlay: true });
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(item(RoadmapAutomationPanelTestId.AutoReview, "on"));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { autoReview: true },
    });
  });

  it.each([
    [RoadmapAutomationPanelTestId.AutoReview, "autoReview"],
    [RoadmapAutomationPanelTestId.AutoAddressComments, "autoAddressComments"],
  ] as const)("renders the %s toggle and patches only its key", async (testId, key) => {
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    await userEvent.click(item(testId, "on"));

    expect(hooks.setConfig.mutate).toHaveBeenCalledWith({
      params: { projectId: "proj-1" },
      body: { [key]: true },
    });
  });

  it("names the company as the source of the PR toggles", () => {
    hooks.config.data = config({
      effective: {
        ...config().effective,
        autoReview: true,
        source: { ...config().effective.source, autoReview: "company" },
      },
    });
    render(<RoadmapAutomationPanel companyName="Shoptet" projectId="proj-1" />);

    expect(screen.getByTestId(RoadmapAutomationPanelTestId.AutoReviewEffective)).toHaveTextContent(
      "Shoptet",
    );
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

    await userEvent.click(item(RoadmapAutomationPanelTestId.AutoPlay, "on"));

    expect(hooks.setConfig.mutate).not.toHaveBeenCalled();
  });

  it("surfaces a load failure instead of rendering toggles in a made-up state", () => {
    hooks.config = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<RoadmapAutomationPanel projectId="proj-1" />);

    expect(screen.queryByTestId(RoadmapAutomationPanelTestId.Root)).not.toBeInTheDocument();
  });
});
