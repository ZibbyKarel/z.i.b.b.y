import { AccordionTestId } from "@zibby/design-system";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import type { RunView } from "../run";
import type { FeedItem } from "../runDetailModel";
import { RunFeedBannersTestId } from "./RunFeedBanners";
import { RunLiveFeed, RunLiveFeedTestId } from "./RunLiveFeed";

vi.mock("../../approvals", () => ({
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({
  useStageRunLogQuery: vi.fn(() => ({ data: { content: "Round one text." } })),
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
    rounds: [],
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
    expect(ids).toEqual([RunLiveFeedTestId.Agent, RunLiveFeedTestId.You, RunLiveFeedTestId.You]);
  });

  it("captions delivery: delivered names the stage, undelivered says NOT DELIVERED", () => {
    renderFeed();
    const captions = screen.getAllByTestId(RunLiveFeedTestId.Delivery);
    expect(captions[0]).toHaveTextContent("Doručeno → 02 CODER");
    expect(captions[1]).toHaveTextContent("Nedoručeno");
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

  describe("phase rounds", () => {
    const wfRun = { ...run, runId: "wf_1" };
    const roundsItem = (n: number): FeedItem => ({
      kind: "agent",
      phaseId: "illustrate",
      who: "illustrate",
      markdown: "Latest text.",
      tools: [],
      live: false,
      rounds: Array.from({ length: n }, (_, i) => ({
        n: i + 1,
        stageRunId: `s${i + 1}`,
        live: false,
      })),
    });
    beforeEach(() => vi.mocked(useStageRunLogQuery).mockClear());

    it("shows one section per round with only the latest expanded", () => {
      render(<RunLiveFeed items={[roundsItem(2)]} mode="running" run={wfRun} />);
      const summaries = screen.getAllByTestId(AccordionTestId.Summary);
      expect(summaries[0]).toHaveTextContent("Kolo 1");
      expect(summaries[1]).toHaveTextContent("Kolo 2");
      expect(summaries[1]).toHaveAttribute("aria-expanded", "true");
      expect(summaries[0]).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByTestId(RunLiveFeedTestId.Round)).toHaveTextContent("Latest text.");
      expect(useStageRunLogQuery).not.toHaveBeenCalled();
    });

    it("opening an earlier round collapses the latest and fetches that round", () => {
      render(<RunLiveFeed items={[roundsItem(2)]} mode="running" run={wfRun} />);
      const summaries = screen.getAllByTestId(AccordionTestId.Summary);
      fireEvent.click(summaries[0]!);
      expect(summaries[0]).toHaveAttribute("aria-expanded", "true");
      expect(summaries[1]).toHaveAttribute("aria-expanded", "false");
      expect(useStageRunLogQuery).toHaveBeenCalledWith("wf_1", "illustrate", "s1");
      expect(screen.getByTestId(RunLiveFeedTestId.Round)).toHaveTextContent("Round one text.");
    });

    it("a new round re-expands the latest", () => {
      const { rerender } = render(
        <RunLiveFeed items={[roundsItem(2)]} mode="running" run={wfRun} />,
      );
      fireEvent.click(screen.getAllByTestId(AccordionTestId.Summary)[0]!);
      rerender(<RunLiveFeed items={[roundsItem(3)]} mode="running" run={wfRun} />);
      const summaries = screen.getAllByTestId(AccordionTestId.Summary);
      expect(summaries).toHaveLength(3);
      expect(summaries[2]).toHaveAttribute("aria-expanded", "true");
      expect(summaries[0]).toHaveAttribute("aria-expanded", "false");
    });

    it("a single round renders without an accordion", () => {
      render(<RunLiveFeed items={[roundsItem(1)]} mode="running" run={wfRun} />);
      expect(screen.queryAllByTestId(AccordionTestId.Root)).toHaveLength(0);
      expect(screen.getByText("Latest text.")).toBeInTheDocument();
    });
  });
});
