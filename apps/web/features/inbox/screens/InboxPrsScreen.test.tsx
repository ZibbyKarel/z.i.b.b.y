import type { InboxPr } from "@zibby/contracts";
import { within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { PrActionsTestId } from "../components/PrActions";
import { PrRowTestId } from "../components/PrRow";
import { InboxPrsScreen, InboxPrsScreenTestId } from "./InboxPrsScreen";

const { hooks, review, merge } = vi.hoisted(() => ({
  hooks: { prs: [] as unknown[] },
  review: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("../queries", () => ({
  useInboxItemsQuery: () => ({
    data: { items: [], epics: [], syncProjectIds: ["api"], errors: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInboxPrsQuery: () => ({
    data: { prs: hooks.prs, errors: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReviewInboxPrMutation: () => ({ mutate: review, isPending: false }),
}));
vi.mock("../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: merge, isPending: false }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));

function pr(number: number, over: Partial<InboxPr>): InboxPr {
  return {
    source: "github",
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/api/pull/${number}`,
    repo: "acme/api",
    author: "me",
    createdAt: "2026-01-01T00:00:00.000Z",
    draft: false,
    ci: "passing",
    review: "none",
    mergeable: true,
    bucket: "mine",
    blocker: "awaiting-review",
    section: "waiting",
    projectId: "api",
    ...over,
  };
}

const sectionId = (s: string) => `${InboxPrsScreenTestId.Section}-${s}`;

/** Drive the HoldButton's rAF loop to completion (same harness as MergeQueueCard.test). */
function mockFrames(frameTime: number) {
  let now = 0;
  let firstFrame = true;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    if (firstFrame) {
      firstFrame = false;
      now = frameTime;
      cb(now);
    }
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
}

describe("InboxPrsScreen sections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    review.mockClear();
    merge.mockClear();
  });

  it("keeps the empty 'needs your review' section and hides other empty ones", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(sectionId("needs-your-review"))).toHaveTextContent(
      "Na vaše review nikdo nečeká.",
    );
    expect(screen.getByTestId(sectionId("ready-to-merge"))).toHaveTextContent("Připraveno k merge");
    for (const s of ["needs-team-review", "waiting", "needs-action"]) {
      expect(screen.queryByTestId(sectionId(s))).not.toBeInTheDocument();
    }
  });

  it("renders sections in display order", () => {
    hooks.prs = [
      pr(5, { section: "ready-to-merge" }),
      pr(4, { section: "needs-action" }),
      pr(3, { section: "waiting" }),
      pr(2, { section: "needs-team-review", bucket: "to-review" }),
      pr(1, { section: "needs-your-review", bucket: "to-review" }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const order = screen
      .getAllByTestId(new RegExp(`^${InboxPrsScreenTestId.Section}-`))
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(
      ["needs-your-review", "needs-team-review", "waiting", "needs-action", "ready-to-merge"].map(
        sectionId,
      ),
    );
  });

  it("offers code review only in the review sections, merge only in ready-to-merge", () => {
    hooks.prs = [
      pr(1, { section: "needs-your-review", bucket: "to-review" }),
      pr(2, { section: "needs-team-review", bucket: "to-review" }),
      pr(3, { section: "waiting" }),
      pr(4, { section: "needs-action" }),
      pr(5, { section: "ready-to-merge" }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const row = (n: number) => screen.getByTestId(`${PrRowTestId.Root}-${n}`);
    const has = (n: number, id: string) => within(row(n)).queryByTestId(id) !== null;
    expect([1, 2, 3, 4, 5].map((n) => has(n, PrActionsTestId.Review))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => has(n, PrActionsTestId.Merge))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("Do code review sends projectId/repo/number/title", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.Review));
    expect(review).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 1, title: "PR 1" } },
      expect.anything(),
    );
  });

  it("a running review disables the button and links to its task", () => {
    hooks.prs = [
      pr(1, {
        section: "needs-your-review",
        bucket: "to-review",
        codeReview: { taskId: "task_9", state: "running" },
      }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrActionsTestId.Review)).toBeDisabled();
    expect(screen.getByTestId(PrActionsTestId.ReviewStatus)).toHaveAttribute(
      "href",
      "/work/tasks/task_9",
    );
  });

  it("holding Squash and merge sends squash + deleteBranch (default on, toggleable)", () => {
    hooks.prs = [pr(5, { section: "ready-to-merge" })];
    mockFrames(1000);
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.pointerDown(screen.getByTestId(PrActionsTestId.Merge));
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith(
      { params: { id: "api", number: 5 }, body: { method: "squash", deleteBranch: true } },
      expect.anything(),
    );
  });

  it("unchecking delete-branch sends deleteBranch: false; a single click never merges", () => {
    hooks.prs = [pr(5, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.DeleteBranch));
    const button = screen.getByTestId(PrActionsTestId.Merge);
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(merge).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    mockFrames(1000);
    fireEvent.pointerDown(button);
    expect(merge).toHaveBeenCalledWith(
      { params: { id: "api", number: 5 }, body: { method: "squash", deleteBranch: false } },
      expect.anything(),
    );
  });

  it("shows the PR count once, after the title — no ordinal before it", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" }), pr(2, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    const header = screen.getByTestId(sectionId("ready-to-merge"));
    expect(header).not.toHaveTextContent(/\d{2} —/);
    expect(header.textContent?.match(/02/g)).toHaveLength(1);
  });
});
