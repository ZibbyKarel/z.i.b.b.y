import { fireEvent, renderWithProviders as render, screen } from "../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { Screen } from "./Screen";
import { ActivityFeedTestId } from "./components/ActivityFeed/ActivityFeed";

/** Isolate the Screen's activity panel: stub the summary widget + catalog queries.
 * Each primary catalog (integrations/skills/pipelines/agents) is a mutable hoisted
 * query stub — `data` mutable so a test can force the empty (fresh) workspace that
 * surfaces the starter cards, and `isPending`/`isError`/`refetch` mutable so Phase
 * 18.2's honest load-state branches (all four pending / all four erroring) can be
 * exercised without a real query client. */
const { primary } = vi.hoisted(() => {
  const query = () => ({
    data: [] as Array<{ id: string }>,
    isPending: false,
    isError: false,
    refetch: () => {},
  });
  return {
    primary: {
      integrations: query(),
      skills: query(),
      pipelines: query(),
      agents: query(),
    },
  };
});
vi.mock("./SummaryWidget", () => ({ SummaryWidget: () => null }));
vi.mock("../integrations/queries", () => ({
  useIntegrationsQuery: () => primary.integrations,
  // The mounted global InboxPanel reads this; empty → it renders null (out of scope here).
  useChannelItemsQuery: () => ({ data: [] }),
}));
vi.mock("../skills/queries", () => ({ useSkillsQuery: () => primary.skills }));
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => primary.pipelines }));
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => primary.agents }));
// QuickLaunchPanel's own dependencies — one pinned chain so the panel actually renders.
vi.mock("../pins", () => ({
  usePinToggle: () => ({ pins: [{ kind: "chain", id: "c1" }], toggle: vi.fn() }),
}));
vi.mock("../chains", () => ({ useChainsQuery: () => ({ data: [{ id: "c1", name: "My chain" }] }) }));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: vi.fn() }) }));
// ApprovalsPanel reads the Fáze 11 project context; "Všechny projekty" here keeps
// the queue unscoped (the scoping itself is covered by the runs Screen test).
vi.mock("../projects", () => ({
  useActiveProject: () => ({ activeProjectId: null, setActiveProject: vi.fn() }),
  ProjectScopeChip: () => null,
  useProjectsQuery: () => ({ data: [] }),
}));

const activity: ActivityEntry[] = [
  {
    id: "a1",
    at: "2026-06-12T07:00:00.000Z",
    kind: "run-started",
    summary: "agent writer started",
    refs: { runRef: "r1" },
  },
];
vi.mock("./queries", () => ({
  useActivityQuery: () => ({ data: activity }),
  // The mounted BriefingCard reads this; undefined → it renders null (out of scope here).
  useBriefingQuery: () => ({ data: undefined }),
}));
vi.mock("./mutations", () => ({
  useGenerateBriefingMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}));

function resetPrimary() {
  for (const q of Object.values(primary)) {
    q.data = [{ id: "x" }];
    q.isPending = false;
    q.isError = false;
    q.refetch = () => {};
  }
}

describe("Overview Screen", () => {
  beforeEach(() => {
    resetPrimary();
  });

  it("mounts the activity feed with the query data", () => {
    render(<Screen />);
    expect(screen.getByTestId(ActivityFeedTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("agent writer started")).toBeInTheDocument();
  });

  it("renders the quick-launch panel for the pinned targets", () => {
    render(<Screen />);
    expect(screen.getByText("Panel rychlého spuštění")).toBeInTheDocument();
    expect(screen.getByText("My chain")).toBeInTheDocument();
  });

  it("links each fresh-workspace starter card to its dashboard segment", () => {
    // Empty workspace → isFresh → the starter cards render (they used to be dead no-ops).
    for (const q of Object.values(primary)) q.data = [];
    render(<Screen />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/skills", "/projects", "/agents", "/pipelines"]),
    );
  });
});

describe("Overview Screen — honest load states (Phase 18.2)", () => {
  beforeEach(() => {
    resetPrimary();
  });

  it("shows the loading state while EVERY primary catalog is pending, not the fresh-workspace starters", () => {
    for (const q of Object.values(primary)) q.isPending = true;
    render(<Screen />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /skills|agents|pipelines|projects/i })).toBeNull();
  });

  it("falls through to the normal render when only SOME primary catalogs are pending", () => {
    primary.integrations.isPending = true;
    render(<Screen />);
    expect(screen.queryByText("Načítání…")).not.toBeInTheDocument();
    expect(screen.getByTestId(ActivityFeedTestId.Root)).toBeInTheDocument();
  });

  it("shows the error state (with retry) when EVERY primary catalog fails", () => {
    const refetch = vi.fn();
    for (const q of Object.values(primary)) {
      q.isError = true;
      q.refetch = refetch;
    }
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetch).toHaveBeenCalledTimes(4);
  });
});
