import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ActivityEntry } from "@zibby/contracts";
import { renderWithProviders, screen } from "../../../test/render";

// The panel reads the same overview activity query the dashboard's own feed
// does — stub it so each test controls exactly what comes back.
const { activityMock } = vi.hoisted(() => ({
  activityMock: vi.fn(() => ({ data: undefined as ActivityEntry[] | undefined, isPending: true })),
}));
vi.mock("../../overview/queries/useActivityQuery", () => ({
  useActivityQuery: activityMock,
  getActivityQueryKey: () => ["activity", "today"],
}));

import { ChatSidePanel, ChatSidePanelTestId } from "./ChatSidePanel";
import { ActivityFeedTestId } from "../../overview/components/ActivityFeed/ActivityFeed";

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(36),
  at: "2026-06-12T07:00:00.000Z",
  kind: "task-created",
  summary: "created a task",
  refs: {},
  ...over,
});

describe("ChatSidePanel (14.5)", () => {
  it("shows a loading state while the activity query is in flight", () => {
    activityMock.mockReturnValue({ data: undefined, isPending: true });
    renderWithProviders(<ChatSidePanel onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatSidePanelTestId.Loading)).toBeInTheDocument();
  });

  it("shows an empty state once loaded with no entries", () => {
    activityMock.mockReturnValue({ data: [], isPending: false });
    renderWithProviders(<ChatSidePanel onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatSidePanelTestId.Empty)).toBeInTheDocument();
  });

  it("renders the activity feed, capped at 12 entries", () => {
    const items = Array.from({ length: 20 }, (_, i) => entry({ summary: `entry ${i}` }));
    activityMock.mockReturnValue({ data: items, isPending: false });
    renderWithProviders(<ChatSidePanel onClose={vi.fn()} />);
    expect(screen.getAllByTestId(ActivityFeedTestId.Item)).toHaveLength(12);
  });

  it("calls onClose from the header close button", async () => {
    activityMock.mockReturnValue({ data: [], isPending: false });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatSidePanel onClose={onClose} />);
    await user.click(screen.getByTestId(ChatSidePanelTestId.Close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
