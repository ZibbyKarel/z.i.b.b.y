import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatLiveLog, ChatLiveLogTestId } from "./ChatLiveLog";

const { mockUseActivityFeedInfiniteQuery, mockUseActivityViewQuery } = vi.hoisted(() => ({
  mockUseActivityFeedInfiniteQuery: vi.fn(),
  mockUseActivityViewQuery: vi.fn(),
}));

vi.mock("../../overview/queries", () => ({
  useActivityFeedInfiniteQuery: mockUseActivityFeedInfiniteQuery,
}));

vi.mock("../../settings/queries", () => ({
  useActivityViewQuery: mockUseActivityViewQuery,
}));

function seedEmpty() {
  mockUseActivityFeedInfiniteQuery.mockReturnValue({ data: [] });
  mockUseActivityViewQuery.mockReturnValue({ data: DEFAULT_ACTIVITY_VIEW });
}

function seedEntries() {
  mockUseActivityFeedInfiniteQuery.mockReturnValue({
    data: [
      { id: "act_2", at: "2026-07-15T10:05:00.000Z", kind: "task-created", summary: "second entry" },
      { id: "act_1", at: "2026-07-15T10:00:00.000Z", kind: "task-created", summary: "first entry" },
    ],
  });
  mockUseActivityViewQuery.mockReturnValue({ data: DEFAULT_ACTIVITY_VIEW });
}

describe("ChatLiveLog", () => {
  it("renders collapsed with the toggle only, no panel", () => {
    seedEmpty();
    renderWithProviders(<ChatLiveLog />);
    expect(screen.getByTestId(ChatLiveLogTestId.Toggle)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatLiveLogTestId.Panel)).toBeNull();
  });

  it("opens the panel when the toggle is clicked", async () => {
    seedEmpty();
    renderWithProviders(<ChatLiveLog />);
    await userEvent.click(screen.getByTestId(ChatLiveLogTestId.Toggle));
    expect(screen.getByTestId(ChatLiveLogTestId.Panel)).toBeInTheDocument();
  });

  it("renders a line per seeded activity entry with summary text and time", async () => {
    seedEntries();
    renderWithProviders(<ChatLiveLog />);
    await userEvent.click(screen.getByTestId(ChatLiveLogTestId.Toggle));
    const lines = screen.getAllByTestId(ChatLiveLogTestId.Line);
    expect(lines).toHaveLength(2);
    expect(screen.getByText("first entry")).toBeInTheDocument();
    expect(screen.getByText("second entry")).toBeInTheDocument();
  });

  it("shows the empty-state copy when the feed has no entries", async () => {
    seedEmpty();
    renderWithProviders(<ChatLiveLog />);
    await userEvent.click(screen.getByTestId(ChatLiveLogTestId.Toggle));
    expect(screen.getByText("Zatím žádná aktivita.")).toBeInTheDocument();
  });

  it("collapses back when the close button is clicked", async () => {
    seedEmpty();
    renderWithProviders(<ChatLiveLog />);
    await userEvent.click(screen.getByTestId(ChatLiveLogTestId.Toggle));
    expect(screen.getByTestId(ChatLiveLogTestId.Panel)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(ChatLiveLogTestId.Close));
    expect(screen.queryByTestId(ChatLiveLogTestId.Panel)).toBeNull();
    expect(screen.getByTestId(ChatLiveLogTestId.Toggle)).toBeInTheDocument();
  });
});
