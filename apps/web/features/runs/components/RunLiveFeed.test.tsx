import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import type { FeedItem } from "../runDetailModel";
import { RunFeedBannersTestId } from "./RunFeedBanners";
import { RunLiveFeed, RunLiveFeedTestId } from "./RunLiveFeed";

vi.mock("../../approvals", () => ({
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./GoalDetailPanel", () => ({
  GoalDetailPanel: () => <div data-testid="goal-detail" />,
}));

const run: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
};

const items: FeedItem[] = [
  {
    kind: "divider",
    phaseId: "p1",
    label: "01 PLANNER",
    stateKey: "done",
    meta: "01:42",
    state: "done",
  },
  {
    kind: "divider",
    phaseId: "p2",
    label: "02 CODER",
    stateKey: "running",
    meta: "01:05",
    state: "working",
  },
  {
    kind: "agent",
    phaseId: "p2",
    who: "coder",
    markdown: "Working on it",
    tools: [{ id: "p2-0", ts: "01", text: "Read → ok" }],
    live: true,
  },
  {
    kind: "you",
    id: "m1",
    to: "p2",
    at: "2026-10-20T10:01:00Z",
    text: "Use the new API",
    delivery: "delivered",
    deliveredPhaseId: "p2",
  },
  {
    kind: "you",
    id: "m2",
    to: "all",
    at: "2026-10-20T10:02:00Z",
    text: "Later",
    delivery: "undelivered",
  },
];

function renderFeed(over: Partial<RunView> = {}, mode: "running" | "parked" = "running") {
  render(<RunLiveFeed items={items} mode={mode} run={{ ...run, ...over }} />);
}

describe("RunLiveFeed", () => {
  it("renders the items in order", () => {
    renderFeed();
    const ids = Array.from(
      screen.getByTestId(RunLiveFeedTestId.Root).querySelectorAll("[data-testid^='run-feed-']"),
    )
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id !== RunLiveFeedTestId.Delivery);
    expect(ids).toEqual([
      RunLiveFeedTestId.Divider,
      RunLiveFeedTestId.Divider,
      RunLiveFeedTestId.Agent,
      RunLiveFeedTestId.You,
      RunLiveFeedTestId.You,
    ]);
  });

  it("captions delivery: delivered names the stage, undelivered says NOT DELIVERED", () => {
    renderFeed();
    const captions = screen.getAllByTestId(RunLiveFeedTestId.Delivery);
    expect(captions[0]).toHaveTextContent("DORUČENO → 02 CODER");
    expect(captions[1]).toHaveTextContent("NEDORUČENO");
  });

  it("a parked run shows the parked banner", () => {
    renderFeed(
      { status: "parked", parked: { phaseId: "p2", attempts: 2, failureFile: "/x" } },
      "parked",
    );
    expect(screen.getByTestId(RunFeedBannersTestId.Parked)).toBeInTheDocument();
  });

  it("a goal run renders the goal panel instead of items", () => {
    renderFeed({ kind: "goal" });
    expect(screen.getByTestId("goal-detail")).toBeInTheDocument();
    expect(screen.queryByTestId(RunLiveFeedTestId.Root)).not.toBeInTheDocument();
  });
});
