import type { Briefing } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ActivityBriefingsScreen } from "./ActivityBriefingsScreen";

const { hooks, generateMutate } = vi.hoisted(() => ({
  hooks: {
    briefing: undefined as Briefing | undefined,
    isPending: false,
    isError: false,
  },
  generateMutate: vi.fn(),
}));
vi.mock("../queries", () => ({
  useBriefingQuery: () => ({
    data: hooks.briefing,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch: vi.fn(),
  }),
}));
vi.mock("../mutations", () => ({
  useGenerateBriefingMutation: () => ({ mutate: generateMutate, isPending: false }),
}));

function briefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    generatedAt: "2020-01-01T08:00:00.000Z",
    since: "2020-01-01T00:00:00.000Z",
    headline: "Two bugs came in overnight, both fixed.",
    nothingNeedsYou: true,
    needsYou: [],
    didForYou: [],
    watching: [],
    engagements: [],
    counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 0, channelItemsNew: 0 },
    ...overrides,
  };
}

describe("ActivityBriefingsScreen (ZB-07)", () => {
  it("renders the headline and the nothing-needs-you state", () => {
    hooks.briefing = briefing();
    hooks.isPending = false;
    hooks.isError = false;
    renderWithProviders(<ActivityBriefingsScreen />);
    expect(screen.getByText("Two bugs came in overnight, both fixed.")).toBeInTheDocument();
    expect(screen.getByText("Nic tě teď nepotřebuje.")).toBeInTheDocument();
  });

  it("fires the generate mutation on 'generate now'", () => {
    hooks.briefing = briefing();
    renderWithProviders(<ActivityBriefingsScreen />);
    fireEvent.click(screen.getByText("Vygenerovat teď"));
    expect(generateMutate).toHaveBeenCalledWith({ body: {} });
  });
});
