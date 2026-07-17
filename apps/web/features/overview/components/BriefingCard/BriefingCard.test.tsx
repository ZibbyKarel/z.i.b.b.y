import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Briefing } from "@zibby/contracts";
import { BriefingCard, BriefingCardTestId } from "./BriefingCard";

const calm: Briefing = {
  generatedAt: "2026-06-12T07:00:00.000Z",
  since: "2026-06-11T07:00:00.000Z",
  headline: "Nothing needs you.",
  nothingNeedsYou: true,
  needsYou: [],
  didForYou: [],
  watching: [],
  engagements: [],
  counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 0, channelItemsNew: 0 },
};

const busy: Briefing = {
  ...calm,
  headline: "1 thing needs you — 1 approval.",
  nothingNeedsYou: false,
  needsYou: [
    {
      kind: "approval",
      id: "ap1",
      summary: "Team Slack wants to channel-reply",
      at: "2026-06-12T06:30:00.000Z",
      refs: { approvalId: "ap1" },
    },
  ],
  didForYou: [{ kind: "run-finished", summary: "agent x → done", at: "2026-06-12T06:00:00.000Z" }],
  watching: [{ integrationId: "team", newItems: 1 }],
  engagements: [
    { projectId: "alpha", name: "Alpha", needsYou: 1, didForYou: 2, queued: 1, held: 1 },
  ],
};

const mutate = vi.fn();
let briefingData: Briefing | undefined = calm;

vi.mock("../../queries", () => ({ useBriefingQuery: () => ({ data: briefingData }) }));
vi.mock("../../mutations", () => ({
  useGenerateBriefingMutation: () => ({ mutate, isPending: false, isSuccess: false }),
}));

beforeEach(() => {
  mutate.mockReset();
  briefingData = calm;
});

describe("BriefingCard", () => {
  it("renders the calm nothing-needs-you state with no needs-you rows", () => {
    render(<BriefingCard />);
    expect(screen.getByTestId(BriefingCardTestId.Headline)).toHaveTextContent("Nothing needs you.");
    expect(screen.queryByTestId(BriefingCardTestId.NeedsYouItem)).not.toBeInTheDocument();
  });

  it("renders needs-you items as links when something needs the operator", () => {
    briefingData = busy;
    render(<BriefingCard />);
    const rows = screen.getAllByTestId(BriefingCardTestId.NeedsYouItem);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/runs");
    expect(rows[0]).toHaveTextContent("Team Slack wants to channel-reply");
  });

  it("fires the generate mutation on click", async () => {
    render(<BriefingCard />);
    await userEvent.click(screen.getByTestId(BriefingCardTestId.Generate));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ body: {} });
  });

  it("renders nothing until the briefing loads", () => {
    briefingData = undefined;
    render(<BriefingCard />);
    expect(screen.queryByTestId(BriefingCardTestId.Root)).not.toBeInTheDocument();
  });

  it("groups the briefing by engagement when projects are attributed (Phase 8.2)", () => {
    briefingData = busy;
    render(<BriefingCard />);
    const rows = screen.getAllByTestId(BriefingCardTestId.Engagement);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Alpha");
  });

  it("shows no engagement rows when nothing is attributed", () => {
    briefingData = calm;
    render(<BriefingCard />);
    expect(screen.queryByTestId(BriefingCardTestId.Engagement)).not.toBeInTheDocument();
  });

  it("renders per-subsystem lines with counts and note (NS2 F3b)", () => {
    briefingData = {
      ...calm,
      subsystems: [
        { subsystem: "forge", name: "Forge", state: "waiting", tier2Count: 0, tier3Count: 2 },
        {
          subsystem: "ledger",
          name: "Ledger",
          state: "idle",
          tier2Count: 0,
          tier3Count: 0,
          note: "62 % týdenního okna",
        },
      ],
    };
    render(<BriefingCard />);
    const rows = screen.getAllByTestId(BriefingCardTestId.SubsystemLine);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Forge");
    expect(rows[0]).toHaveTextContent("2 čeká na tebe");
    expect(rows[1]).toHaveTextContent("Ledger");
    expect(rows[1]).toHaveTextContent("62 % týdenního okna");
  });

  it("renders no subsystem section when the briefing carries none (old briefings)", () => {
    briefingData = calm;
    render(<BriefingCard />);
    expect(screen.queryByTestId(BriefingCardTestId.SubsystemLine)).not.toBeInTheDocument();
  });
});
