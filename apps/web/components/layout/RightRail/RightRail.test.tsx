import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { ButtonGroupTestId } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { RightRail, RightRailTestId } from "./RightRail";

let feedData: ActivityEntry[] = [];

vi.mock("../../../features/overview/queries", () => ({
  useActivityFeedInfiniteQuery: () => ({
    data: feedData,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock("../../../features/settings/queries", () => ({
  useActivityViewQuery: () => ({ data: undefined }), // falls back to DEFAULT_ACTIVITY_VIEW
}));

const entry = (id: string, overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id,
  at: "2026-07-17T08:00:00.000Z",
  kind: "run-finished",
  summary: `summary ${id}`,
  refs: {},
  ...overrides,
});

beforeEach(() => {
  feedData = [];
});

describe("RightRail", () => {
  it("renders the live activity log header and empty state", () => {
    renderWithProviders(<RightRail />);
    expect(screen.getByText("Živý log")).toBeInTheDocument();
    expect(screen.getByText("Zatím žádná aktivita.")).toBeInTheDocument();
  });

  describe("subsystem filter (NS2 F3c)", () => {
    const mixed = () => [
      entry("e1", { refs: { ownerSubsystem: "forge" } }),
      entry("e2", { refs: { ownerSubsystem: "puls" } }),
      entry("e3"), // untagged system record
    ];

    it("shows no filter when no loaded entry carries an ownerSubsystem tag", () => {
      feedData = [entry("e1"), entry("e2")];
      renderWithProviders(<RightRail />);
      expect(screen.queryByTestId(RightRailTestId.SubsystemFilter)).not.toBeInTheDocument();
      expect(screen.getAllByTestId(RightRailTestId.Line)).toHaveLength(2);
    });

    it("narrows the log to the selected subsystem's entries", async () => {
      feedData = mixed();
      renderWithProviders(<RightRail />);
      expect(screen.getAllByTestId(RightRailTestId.Line)).toHaveLength(3);
      // Only tagged subsystems become options.
      expect(screen.getByTestId(`${ButtonGroupTestId.Option}-forge`)).toBeInTheDocument();
      expect(screen.queryByTestId(`${ButtonGroupTestId.Option}-beacon`)).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-forge`));
      const lines = screen.getAllByTestId(RightRailTestId.Line);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toHaveTextContent("summary e1");
    });

    it("deselecting the active subsystem shows everything again (vše)", async () => {
      feedData = mixed();
      renderWithProviders(<RightRail />);
      const forge = screen.getByTestId(`${ButtonGroupTestId.Option}-forge`);
      await userEvent.click(forge);
      expect(screen.getAllByTestId(RightRailTestId.Line)).toHaveLength(1);
      await userEvent.click(forge); // toggle off — untagged entries return too
      expect(screen.getAllByTestId(RightRailTestId.Line)).toHaveLength(3);
    });
  });
});
