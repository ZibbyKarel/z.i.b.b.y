import { DataTableTestId } from "@zibby/design-system";
import type { ChannelItem } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { ActivityInboxScreen } from "./ActivityInboxScreen";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    items: [] as ChannelItem[],
    isPending: false,
    isError: false,
  },
}));
vi.mock("../../../integrations/queries", () => ({
  useChannelItemsQuery: () => ({
    data: hooks.items,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch: vi.fn(),
  }),
}));

function item(overrides: Partial<ChannelItem> = {}): ChannelItem {
  return {
    id: "ci_1",
    integrationId: "slack-support",
    kind: "slack",
    externalRef: { channel: "c1", ts: "1" },
    from: "Jane",
    receivedAt: "2020-01-01T08:00:00.000Z",
    text: "Can you look at the failing build please?",
    raw: {},
    state: "new",
    ...overrides,
  } as ChannelItem;
}

describe("ActivityInboxScreen (ZB-07)", () => {
  it("renders inbox items as a table with source, sender and a truncated preview", () => {
    hooks.items = [item()];
    renderWithProviders(<ActivityInboxScreen />);
    expect(screen.getByTestId(DataTableTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("Can you look at the failing build please?")).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", () => {
    hooks.items = [];
    renderWithProviders(<ActivityInboxScreen />);
    expect(screen.getByText("Zatím žádné zprávy")).toBeInTheDocument();
  });
});
