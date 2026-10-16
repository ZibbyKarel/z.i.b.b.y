import type { InboxPr } from "@zibby/contracts";
import { within } from "@testing-library/react";
import { AccordionTestId, DropDownButtonTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { PrActionsTestId } from "../components/PrActions";
import { PrRowTestId } from "../components/PrRow";
import { InboxPrsScreen, InboxPrsScreenTestId } from "./InboxPrsScreen";

const { hooks, review, merge } = vi.hoisted(() => ({
  hooks: { prs: [] as unknown[], search: "", reviewPending: false },
  review: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inbox/pull-requests",
  useSearchParams: () => new URLSearchParams(hooks.search),
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
  useReviewInboxPrMutation: () => ({ mutate: review, isPending: hooks.reviewPending }),
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
const headerOf = (s: string) =>
  within(screen.getByTestId(sectionId(s))).getByTestId(AccordionTestId.Summary);

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
    window.sessionStorage.clear();
    hooks.search = "";
    hooks.reviewPending = false;
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

  it("the primary segment starts a quick review", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    fireEvent.click(within(split).getByTestId(DropDownButtonTestId.Primary));
    expect(review).toHaveBeenCalledWith(
      {
        body: { projectId: "api", repo: "acme/api", number: 1, title: "PR 1", level: "quick" },
      },
      expect.anything(),
    );
  });

  it.each(["thorough", "tested"] as const)("the %s menu item starts that level", (level) => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    fireEvent.click(within(split).getByTestId(DropDownButtonTestId.Trigger));
    fireEvent.click(screen.getByTestId(`${DropDownButtonTestId.Item}-${level}`));
    expect(review).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 1, title: "PR 1", level } },
      expect.anything(),
    );
  });

  it("labels the split button and its menu (cs default)", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    expect(within(split).getByTestId(DropDownButtonTestId.Primary)).toHaveTextContent(
      "Rychlé code-review",
    );
    expect(within(split).getByTestId(DropDownButtonTestId.Trigger)).toHaveAccessibleName(
      "Další úrovně code-review",
    );
  });

  it("a running review disables both segments and links to its task", () => {
    hooks.prs = [
      pr(1, {
        section: "needs-your-review",
        bucket: "to-review",
        codeReview: { taskId: "task_9", state: "running" },
      }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    expect(within(split).getByTestId(DropDownButtonTestId.Primary)).toBeDisabled();
    expect(within(split).getByTestId(DropDownButtonTestId.Trigger)).toBeDisabled();
    expect(screen.getByTestId(PrActionsTestId.ReviewStatus)).toHaveAttribute(
      "href",
      "/work/tasks/task_9",
    );
  });

  it("a pending review request disables the menu trigger too", () => {
    hooks.reviewPending = true;
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    expect(within(split).getByTestId(DropDownButtonTestId.Trigger)).toBeDisabled();
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
    const header = headerOf("ready-to-merge");
    expect(header).not.toHaveTextContent(/\d{2} —/);
    expect(header.textContent?.match(/02/g)).toHaveLength(1);
  });

  it("sections start expanded and collapse on header click", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    const header = headerOf("ready-to-merge");
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(sectionId("ready-to-merge"))).toHaveTextContent("PR 1");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId(sectionId("ready-to-merge"))).not.toHaveTextContent("PR 1");
  });

  it("remembers a collapsed section for the session", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    const first = renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(headerOf("ready-to-merge"));
    first.unmount();
    renderWithProviders(<InboxPrsScreen />);
    expect(headerOf("ready-to-merge")).toHaveAttribute("aria-expanded", "false");
  });

  it("a focused PR shows even when its section was collapsed", () => {
    window.sessionStorage.setItem(
      "zibby-inbox-pr-sections-collapsed",
      JSON.stringify({ "ready-to-merge": true }),
    );
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    hooks.search = "pr=https://github.com/acme/api/pull/1";
    renderWithProviders(<InboxPrsScreen />);
    expect(headerOf("ready-to-merge")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(sectionId("ready-to-merge"))).toHaveTextContent("PR 1");
  });

  it("keeps block elements out of the summary button", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    expect(headerOf("ready-to-merge").querySelector("h3, div")).toBeNull();
  });

  it("the empty 'needs your review' section collapses too", () => {
    hooks.prs = [];
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(headerOf("needs-your-review"));
    expect(screen.getByTestId(sectionId("needs-your-review"))).not.toHaveTextContent(
      "Na vaše review nikdo nečeká.",
    );
  });
});
