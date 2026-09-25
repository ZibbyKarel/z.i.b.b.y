import { fireEvent } from "@testing-library/react";
import { DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ActivityLogScreen } from "./ActivityLogScreen";

const {
  mockUseActivityFeedInfiniteQuery,
  mockUseActivityViewQuery,
  mockUseAgentsQuery,
  fetchNextPage,
} = vi.hoisted(() => ({
  mockUseActivityFeedInfiniteQuery: vi.fn(),
  mockUseActivityViewQuery: vi.fn(),
  mockUseAgentsQuery: vi.fn(),
  fetchNextPage: vi.fn(),
}));

vi.mock("../queries", () => ({
  useActivityFeedInfiniteQuery: mockUseActivityFeedInfiniteQuery,
}));
vi.mock("../../settings/queries", () => ({
  useActivityViewQuery: mockUseActivityViewQuery,
}));
vi.mock("../../agents", () => ({
  useAgentsQuery: mockUseAgentsQuery,
}));

function seed() {
  mockUseActivityFeedInfiniteQuery.mockReturnValue({
    data: [
      {
        id: "act_2",
        at: "2026-07-15T10:05:00.000Z",
        kind: "task-created",
        summary: "second entry",
        refs: { department: "dev" },
      },
      {
        id: "act_1",
        at: "2026-07-15T10:00:00.000Z",
        kind: "task-created",
        summary: "first entry",
        refs: {},
      },
    ],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  mockUseActivityViewQuery.mockReturnValue({ data: DEFAULT_ACTIVITY_VIEW });
  mockUseAgentsQuery.mockReturnValue({ data: [] });
}

describe("ActivityLogScreen (ZB-07)", () => {
  it("renders a log line per seeded activity entry", () => {
    seed();
    renderWithProviders(<ActivityLogScreen />);
    expect(screen.getByText("first entry")).toBeInTheDocument();
    expect(screen.getByText("second entry")).toBeInTheDocument();
  });

  it("freezes the feed while paused", () => {
    seed();
    renderWithProviders(<ActivityLogScreen />);
    fireEvent.click(screen.getByText("Pozastavit"));
    mockUseActivityFeedInfiniteQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    // Still shows the frozen snapshot rather than the (now-empty) live feed.
    expect(screen.getByText("first entry")).toBeInTheDocument();
  });

  it("clears the currently displayed lines", () => {
    seed();
    renderWithProviders(<ActivityLogScreen />);
    fireEvent.click(screen.getByText("Vyčistit"));
    expect(screen.queryByText("first entry")).toBeNull();
  });
});
