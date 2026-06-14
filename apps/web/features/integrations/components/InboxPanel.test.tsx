import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import type { ChannelItem } from "@zibby/contracts";
import { InboxPanel, InboxPanelTestId } from "./InboxPanel";

let items: ChannelItem[] = [];
vi.mock("../queries", () => ({
  useChannelItemsQuery: () => ({ data: items }),
}));

const item = (over: Partial<ChannelItem>): ChannelItem => ({
  id: "C1-100",
  integrationId: "team",
  kind: "slack",
  externalRef: { channel: "C1", ts: "100" },
  receivedAt: "2026-06-12T00:00:00.000Z",
  text: "the app crashes",
  raw: {},
  state: "new",
  ...over,
});

describe("InboxPanel", () => {
  it("renders nothing when there are no items", () => {
    items = [];
    render(<InboxPanel />);
    expect(screen.queryByTestId(InboxPanelTestId.Root)).toBeNull();
  });

  it("renders a row per item with the state chip and an approval marker", () => {
    items = [
      item({ id: "a", state: "handled" }),
      item({
        id: "b",
        state: "triaged",
        approvalId: "appr_1",
        triage: { actionable: true, tier: 3, category: "request", confidence: 0.6, reason: "x" },
      }),
    ];
    render(<InboxPanel />);
    expect(screen.getByTestId(InboxPanelTestId.Root)).toBeInTheDocument();
    expect(screen.getAllByTestId(InboxPanelTestId.Item)).toHaveLength(2);
    // The triaged item with an approval shows the "needs approval" marker (cs catalog).
    expect(screen.getByText("čeká na schválení")).toBeInTheDocument();
  });

  it("surfaces the autonomy tier of a triaged item (accountability)", () => {
    items = [
      item({
        id: "t3",
        state: "triaged",
        approvalId: "appr_1",
        triage: { actionable: true, tier: 3, category: "request", confidence: 0.6, reason: "x" },
      }),
    ];
    render(<InboxPanel />);
    expect(screen.getByText("Tier 3")).toBeInTheDocument();
  });

  it("shows the handling action — dispatched for a Tier-1 task, replied for a sent reply", () => {
    items = [
      item({
        id: "t1",
        state: "handled",
        taskId: "writer_1",
        triage: { actionable: true, tier: 1, category: "bug", confidence: 0.9, reason: "x" },
      }),
      item({
        id: "t2",
        state: "handled",
        reply: { text: "thanks", sentAt: "2026-06-12T01:00:00.000Z" },
        triage: { actionable: true, tier: 2, category: "question", confidence: 0.8, reason: "x" },
      }),
    ];
    render(<InboxPanel />);
    expect(screen.getByText("předáno")).toBeInTheDocument();
    expect(screen.getByText("odpovězeno")).toBeInTheDocument();
    expect(screen.getByText("Tier 1")).toBeInTheDocument();
    expect(screen.getByText("Tier 2")).toBeInTheDocument();
  });
});
