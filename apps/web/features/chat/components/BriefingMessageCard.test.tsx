import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import type { Briefing } from "@zibby/contracts";
import { BriefingCardTestId } from "../../overview/components/BriefingCard/BriefingCard";
import { BriefingMessageCard, BriefingMessageCardTestId } from "./BriefingMessageCard";

const calm: Briefing = {
  generatedAt: "2026-07-19T07:00:00.000Z",
  since: "2026-07-18T07:00:00.000Z",
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
      at: "2026-07-19T06:30:00.000Z",
      refs: { approvalId: "ap1" },
    },
  ],
  didForYou: [{ kind: "run-finished", summary: "agent x → done", at: "2026-07-19T06:00:00.000Z" }],
  watching: [{ integrationId: "team", newItems: 1 }],
  engagements: [
    { projectId: "alpha", name: "Alpha", needsYou: 1, didForYou: 2, queued: 1, held: 1 },
  ],
};

describe("BriefingMessageCard (F8a / O6)", () => {
  it("renders the calm nothing-needs-you state with no needs-you rows", () => {
    render(<BriefingMessageCard briefing={calm} />);
    expect(screen.getByTestId(BriefingMessageCardTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(BriefingCardTestId.Headline)).toHaveTextContent("Nothing needs you.");
    expect(screen.queryByTestId(BriefingCardTestId.NeedsYouItem)).not.toBeInTheDocument();
  });

  it("renders needs-you rows linking to /archiv (F8a repoint, not /runs)", () => {
    render(<BriefingMessageCard briefing={busy} />);
    const rows = screen.getAllByTestId(BriefingCardTestId.NeedsYouItem);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/archiv");
    expect(rows[0]).toHaveTextContent("Team Slack wants to channel-reply");
  });

  it("groups the briefing by engagement when projects are attributed", () => {
    render(<BriefingMessageCard briefing={busy} />);
    const rows = screen.getAllByTestId(BriefingCardTestId.Engagement);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Alpha");
  });

  it("renders per-subsystem lines when the briefing carries them (NS2 F3b)", () => {
    render(
      <BriefingMessageCard
        briefing={{
          ...calm,
          subsystems: [
            { subsystem: "forge", name: "Forge", state: "waiting", tier2Count: 0, tier3Count: 2 },
          ],
        }}
      />,
    );
    const rows = screen.getAllByTestId(BriefingCardTestId.SubsystemLine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Forge");
  });

  it("never renders a 'Generate now' control — a past turn is a fixed snapshot", () => {
    render(<BriefingMessageCard briefing={busy} />);
    expect(screen.queryByTestId(BriefingCardTestId.Generate)).not.toBeInTheDocument();
  });
});
