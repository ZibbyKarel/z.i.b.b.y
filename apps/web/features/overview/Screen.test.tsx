import { renderWithProviders as render, screen } from "../../test/render"
import { describe, expect, it, vi } from "vitest"
import type { ActivityEntry } from "@zibby/contracts"
import { Screen } from "./Screen"
import { ActivityFeedTestId } from "./components/ActivityFeed/ActivityFeed"

/** Isolate the Screen's activity panel: stub the summary widget + catalog queries. */
vi.mock("./SummaryWidget", () => ({ SummaryWidget: () => null }))
vi.mock("../integrations/queries", () => ({ useIntegrationsQuery: () => ({ data: [{ id: "x" }] }) }))
vi.mock("../skills/queries", () => ({ useSkillsQuery: () => ({ data: [] }) }))
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }))
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }))

const activity: ActivityEntry[] = [
  { id: "a1", at: "2026-06-12T07:00:00.000Z", kind: "run-started", summary: "agent writer started", refs: { runRef: "r1" } },
]
vi.mock("./queries", () => ({
  useActivityQuery: () => ({ data: activity }),
  // The mounted BriefingCard reads this; undefined → it renders null (out of scope here).
  useBriefingQuery: () => ({ data: undefined }),
}))
vi.mock("./mutations", () => ({
  useGenerateBriefingMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))

describe("Overview Screen", () => {
  it("mounts the activity feed with the query data", () => {
    render(<Screen />)
    expect(screen.getByTestId(ActivityFeedTestId.Root)).toBeInTheDocument()
    expect(screen.getByText("agent writer started")).toBeInTheDocument()
  })
})
