import { renderWithProviders as render, screen } from "../../../../test/render"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Briefing } from "@zibby/contracts"
import { BriefingCard, BriefingCardTestId } from "./BriefingCard"

const calm: Briefing = {
  generatedAt: "2026-06-12T07:00:00.000Z",
  since: "2026-06-11T07:00:00.000Z",
  headline: "Nothing needs you.",
  nothingNeedsYou: true,
  needsYou: [],
  didForYou: [],
  watching: [],
  counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 0, channelItemsNew: 0 },
}

const busy: Briefing = {
  ...calm,
  headline: "1 thing needs you — 1 approval.",
  nothingNeedsYou: false,
  needsYou: [{ kind: "approval", id: "ap1", summary: "Team Slack wants to channel-reply", at: "2026-06-12T06:30:00.000Z", refs: { approvalId: "ap1" } }],
  didForYou: [{ kind: "run-finished", summary: "agent x → done", at: "2026-06-12T06:00:00.000Z" }],
  watching: [{ integrationId: "team", newItems: 1 }],
}

const mutate = vi.fn()
let briefingData: Briefing | undefined = calm

vi.mock("../../queries", () => ({ useBriefingQuery: () => ({ data: briefingData }) }))
vi.mock("../../mutations", () => ({
  useGenerateBriefingMutation: () => ({ mutate, isPending: false, isSuccess: false }),
}))

beforeEach(() => {
  mutate.mockReset()
  briefingData = calm
})

describe("BriefingCard", () => {
  it("renders the calm nothing-needs-you state with no needs-you rows", () => {
    render(<BriefingCard />)
    expect(screen.getByTestId(BriefingCardTestId.Headline)).toHaveTextContent("Nothing needs you.")
    expect(screen.queryByTestId(BriefingCardTestId.NeedsYouItem)).not.toBeInTheDocument()
  })

  it("renders needs-you items as links when something needs the operator", () => {
    briefingData = busy
    render(<BriefingCard />)
    const rows = screen.getAllByTestId(BriefingCardTestId.NeedsYouItem)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute("href", "/runs")
    expect(rows[0]).toHaveTextContent("Team Slack wants to channel-reply")
  })

  it("fires the generate mutation on click", async () => {
    render(<BriefingCard />)
    await userEvent.click(screen.getByTestId(BriefingCardTestId.Generate))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ body: {} })
  })

  it("renders nothing until the briefing loads", () => {
    briefingData = undefined
    render(<BriefingCard />)
    expect(screen.queryByTestId(BriefingCardTestId.Root)).not.toBeInTheDocument()
  })
})
