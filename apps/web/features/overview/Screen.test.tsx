import { renderWithProviders as render, screen } from "../../test/render"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityEntry } from "@zibby/contracts"
import { Screen } from "./Screen"
import { ActivityFeedTestId } from "./components/ActivityFeed/ActivityFeed"

/** Isolate the Screen's activity panel: stub the summary widget + catalog queries.
 * `integrations.data` is mutable so a test can force the empty (fresh) workspace that
 * surfaces the starter cards. */
const { integrations } = vi.hoisted(() => ({
  integrations: { data: [{ id: "x" }] as Array<{ id: string }> },
}))
vi.mock("./SummaryWidget", () => ({ SummaryWidget: () => null }))
vi.mock("../integrations/queries", () => ({
  useIntegrationsQuery: () => ({ data: integrations.data }),
  // The mounted global InboxPanel reads this; empty → it renders null (out of scope here).
  useChannelItemsQuery: () => ({ data: [] }),
}))
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
  beforeEach(() => {
    integrations.data = [{ id: "x" }]
  })

  it("mounts the activity feed with the query data", () => {
    render(<Screen />)
    expect(screen.getByTestId(ActivityFeedTestId.Root)).toBeInTheDocument()
    expect(screen.getByText("agent writer started")).toBeInTheDocument()
  })

  it("links each fresh-workspace starter card to its dashboard segment", () => {
    // Empty workspace → isFresh → the starter cards render (they used to be dead no-ops).
    integrations.data = []
    render(<Screen />)
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"))
    expect(hrefs).toEqual(
      expect.arrayContaining(["/skills", "/projects", "/agents", "/pipelines"]),
    )
  })
})
