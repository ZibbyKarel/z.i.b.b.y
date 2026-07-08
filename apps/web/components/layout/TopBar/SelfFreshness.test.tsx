import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelfStatus } from "@zibby/contracts";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { SelfFreshness, SelfFreshnessTestId } from "./SelfFreshness";

const { statusRef, mutateMock } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
  mutateMock: vi.fn(),
}));

vi.mock("../../../features/self", () => ({
  useSelfStatusQuery: () => ({ data: statusRef.value }),
  useSelfUpdateMutation: () => ({ mutate: mutateMock, isPending: false }),
}));

const UP_TO_DATE: SelfStatus = {
  currentBranch: "main",
  defaultBranch: "main",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: true,
};

const BEHIND_WITH_PRS: SelfStatus = {
  ...UP_TO_DATE,
  behind: 3,
  upToDate: false,
  openPrCount: 2,
  prs: [
    { number: 12, title: "Fix the thing", url: "https://github.com/o/r/pull/12" },
    { number: 13, title: "Add feature", url: "https://github.com/o/r/pull/13" },
  ],
};

describe("SelfFreshness", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    statusRef.value = undefined;
  });

  it("renders a calm state with no behind text or update button when up to date", () => {
    statusRef.value = UP_TO_DATE;
    renderWithProviders(<SelfFreshness />);
    expect(screen.getByTestId(SelfFreshnessTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(SelfFreshnessTestId.BehindText)).not.toBeInTheDocument();
    expect(screen.queryByTestId(SelfFreshnessTestId.UpdateButton)).not.toBeInTheDocument();
  });

  it("falls back to the calm up-to-date state before the first poll resolves (data undefined)", () => {
    statusRef.value = undefined;
    renderWithProviders(<SelfFreshness />);
    expect(screen.queryByTestId(SelfFreshnessTestId.UpdateButton)).not.toBeInTheDocument();
  });

  it("shows the behind count and an update button that triggers the mutation", () => {
    statusRef.value = BEHIND_WITH_PRS;
    renderWithProviders(<SelfFreshness />);
    expect(screen.getByTestId(SelfFreshnessTestId.BehindText)).toHaveTextContent(
      "o 3 commitů pozadu",
    );
    fireEvent.click(screen.getByTestId(SelfFreshnessTestId.UpdateButton));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]?.[0]).toEqual({ body: {} });
  });

  it("lists every open PR as an external link on hover, with the right href/target/rel", () => {
    statusRef.value = BEHIND_WITH_PRS;
    renderWithProviders(<SelfFreshness />);
    fireEvent.mouseEnter(screen.getByTestId(SelfFreshnessTestId.Root));

    const rows = screen.getAllByTestId(SelfFreshnessTestId.PrRow);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "https://github.com/o/r/pull/12");
    expect(rows[0]).toHaveAttribute("target", "_blank");
    expect(rows[0]).toHaveAttribute("rel", "noreferrer");
    expect(rows[0]).toHaveTextContent("#12 Fix the thing");
  });

  it("shows the 'no open PRs' note on hover when the list is empty (gh unavailable or none open)", () => {
    statusRef.value = { ...UP_TO_DATE, ghAvailable: false, prs: [], openPrCount: 0 };
    renderWithProviders(<SelfFreshness />);
    fireEvent.mouseEnter(screen.getByTestId(SelfFreshnessTestId.Root));

    expect(screen.getByTestId(SelfFreshnessTestId.PrEmpty)).toHaveTextContent("žádné otevřené PR");
    expect(screen.queryByTestId(SelfFreshnessTestId.PrRow)).not.toBeInTheDocument();
  });
});
