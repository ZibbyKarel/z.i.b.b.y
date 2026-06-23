import { describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  ProjectIntegrationActivityPanel,
  ProjectIntegrationActivityPanelTestId,
} from "./ProjectIntegrationActivityPanel";

const items: ActivityEntry[] = [
  {
    id: "act_1",
    at: "2026-06-23T09:00:00.000Z",
    kind: "channel-item",
    summary: "inbound email item from mail",
    refs: { projectId: "acme", integrationId: "mail", itemId: "i1" },
  },
];

const mockData = vi.fn();
vi.mock("../queries", () => ({
  useProjectIntegrationActivityQuery: () => mockData(),
}));

describe("ProjectIntegrationActivityPanel", () => {
  it("shows the empty state when no integration activity is recorded", () => {
    mockData.mockReturnValue({ data: [] });
    render(<ProjectIntegrationActivityPanel projectId="acme" />);
    expect(
      screen.getByTestId(ProjectIntegrationActivityPanelTestId.Empty),
    ).toBeInTheDocument();
  });

  it("renders the activity feed when entries exist", () => {
    mockData.mockReturnValue({ data: items });
    render(<ProjectIntegrationActivityPanel projectId="acme" />);
    expect(screen.queryByTestId(ProjectIntegrationActivityPanelTestId.Empty)).toBeNull();
    expect(screen.getByText("inbound email item from mail")).toBeInTheDocument();
  });
});
