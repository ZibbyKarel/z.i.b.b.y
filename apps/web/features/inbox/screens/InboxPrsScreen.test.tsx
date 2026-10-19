import type { InboxPr } from "@zibby/contracts";
import { within } from "@testing-library/react";
import {
  AccordionTestId,
  DropDownButtonTestId,
  GridTestId,
  TypographyTestId,
} from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { PrDetailTestId } from "../components/PrDetail";
import { PrActionsTestId } from "../components/PrActions";
import { ChainLinksTestId } from "../components/ChainLinks";
import { PrRowTestId } from "../components/PrRow";
import { InboxPrsScreen, InboxPrsScreenTestId } from "./InboxPrsScreen";

const { hooks, review, merge, rebase } = vi.hoisted(() => ({
  hooks: {
    prs: [] as unknown[],
    search: "",
    reviewPending: false,
    replace: vi.fn(),
    diffQuery: {} as unknown,
  },
  review: vi.fn(),
  merge: vi.fn(),
  rebase: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: hooks.replace }),
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
  useInboxPrDiffQuery: () => hooks.diffQuery,
  useInboxPrsQuery: () => ({
    data: { prs: hooks.prs, errors: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../components/PrDiff/PrDiff", () => ({
  PrDiff: ({ diff }: { diff: string }) => <div data-testid="pr-diff">{diff}</div>,
}));
vi.mock("../mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReviewInboxPrMutation: () => ({ mutate: review, isPending: hooks.reviewPending }),
  useRebaseInboxPrMutation: () => ({ mutate: rebase, isPending: false }),
}));
vi.mock("../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: merge, isPending: false }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));

const okDiff = {
  data: { diff: "", truncated: false },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};
const urlOf = (n: number) => `https://github.com/acme/api/pull/${n}`;

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
    hooks.diffQuery = okDiff;
    hooks.replace.mockClear();
    vi.restoreAllMocks();
    review.mockReset();
    merge.mockClear();
    rebase.mockReset();
  });

  it("offers Rebase only on my PRs that conflict with or are behind their base", () => {
    hooks.prs = [
      pr(1, { section: "needs-action", mergeable: false, blocker: "merge-conflict" }),
      pr(2, { section: "waiting", behind: true }),
      pr(3, { section: "waiting" }),
      pr(4, { section: "needs-your-review", bucket: "to-review", mergeable: false }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const has = (n: number) =>
      within(screen.getByTestId(`${PrRowTestId.Root}-${n}`)).queryByTestId(
        PrActionsTestId.Rebase,
      ) !== null;
    expect([1, 2, 3, 4].map(has)).toEqual([true, true, false, false]);
  });

  it("clicking Rebase starts it for that PR", () => {
    hooks.prs = [pr(1, { section: "needs-action", mergeable: false })];
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.Rebase));
    expect(rebase).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 1, title: "PR 1" } },
      expect.anything(),
    );
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toHaveTextContent("Rebase na cílovou větev");
  });

  it("a refused rebase shows the server's reason", () => {
    hooks.prs = [pr(1, { section: "needs-action", mergeable: false })];
    rebase.mockImplementationOnce((_vars, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.({ status: 422, body: { message: "acme/api#1 comes from a fork" } }),
    );
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.Rebase));
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Rebase odmítnut: acme/api#1 comes from a fork",
    );
  });

  it("a running rebase disables the button and links to its task", () => {
    hooks.prs = [
      pr(1, {
        section: "needs-action",
        mergeable: false,
        rebase: { taskId: "task_7", state: "running" },
      }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toBeDisabled();
    expect(screen.getByTestId(PrActionsTestId.RebaseStatus)).toHaveAttribute(
      "href",
      "/work/tasks/task_7",
    );
    expect(screen.getByTestId(PrActionsTestId.RebaseStatus)).toHaveTextContent("Rebase běží");
  });

  it("a pushed rebase keeps its status link after the PR is up to date again", () => {
    hooks.prs = [pr(1, { section: "waiting", rebase: { taskId: "task_7", state: "pushed" } })];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.queryByTestId(PrActionsTestId.Rebase)).toBeNull();
    expect(screen.getByTestId(PrActionsTestId.RebaseStatus)).toHaveTextContent("Rebase pushnut");
  });

  it("hides every empty section", () => {
    hooks.prs = [pr(1, { section: "ready-to-merge" })];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(sectionId("ready-to-merge"))).toHaveTextContent("Připraveno k merge");
    for (const s of ["needs-your-review", "needs-team-review", "waiting", "needs-action"]) {
      expect(screen.queryByTestId(sectionId(s))).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId(InboxPrsScreenTestId.Empty)).not.toBeInTheDocument();
  });

  it("shows an empty state when no section has a PR", () => {
    hooks.prs = [];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(InboxPrsScreenTestId.Empty)).toHaveTextContent("Žádné pull requesty");
    expect(screen.queryByTestId(sectionId("needs-your-review"))).not.toBeInTheDocument();
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

  it("card shows review/CI badges only when they say something, and a click selects it", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    hooks.prs = [
      pr(1, { section: "needs-your-review", bucket: "to-review", review: "none" }),
      pr(2, { section: "ready-to-merge", review: "approved" }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const row = (n: number) => screen.getByTestId(`${PrRowTestId.Root}-${n}`);
    expect(within(row(1)).queryByTestId(PrRowTestId.Review)).toBeNull();
    expect(within(row(2)).getByTestId(PrRowTestId.Review)).toHaveTextContent(/approved|schváleno/i);
    expect(within(row(2)).getByTestId(PrRowTestId.Ci)).toBeInTheDocument();

    fireEvent.click(within(row(2)).getByTestId(PrRowTestId.Meta));
    expect(hooks.replace).toHaveBeenCalledWith(
      `/inbox/pull-requests?pr=${encodeURIComponent(urlOf(2))}`,
    );
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(within(row(2)).getByTestId(PrActionsTestId.DeleteBranch));
    expect(open).not.toHaveBeenCalled();
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

  it("a successful review start shows no extra message — only the status link reports it", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    review.mockImplementation((_vars, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    fireEvent.click(within(split).getByTestId(DropDownButtonTestId.Primary));
    expect(screen.queryByTestId(PrActionsTestId.Message)).toBeNull();
  });

  it("a failed review start shows the error, and a later success clears it", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    review.mockImplementationOnce((_vars, opts: { onError?: () => void }) => opts.onError?.());
    renderWithProviders(<InboxPrsScreen />);
    const primary = () =>
      within(screen.getByTestId(PrActionsTestId.Review)).getByTestId(DropDownButtonTestId.Primary);
    fireEvent.click(primary());
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Code-review se nepodařilo spustit.",
    );
    review.mockImplementationOnce((_vars, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    fireEvent.click(primary());
    expect(screen.queryByTestId(PrActionsTestId.Message)).toBeNull();
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

  it("the selected PR shows even when its section was collapsed", () => {
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
});

describe("InboxPrsScreen master–detail", () => {
  afterEach(() => {
    hooks.search = "";
    hooks.diffQuery = okDiff;
    hooks.replace.mockClear();
    vi.restoreAllMocks();
  });
  const two = () => [
    pr(1, { section: "waiting" }),
    pr(2, { section: "needs-your-review", bucket: "to-review" }),
  ];
  const select2 = () => {
    hooks.prs = two();
    hooks.search = `pr=${encodeURIComponent(urlOf(2))}`;
  };

  it("shows the placeholder when no PR is selected", () => {
    hooks.prs = two();
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(InboxPrsScreenTestId.Placeholder)).toHaveTextContent(
      "Vyber PR vlevo",
    );
    expect(screen.queryByTestId(PrDetailTestId.Root)).toBeNull();
  });

  it("clicking a card selects it without opening GitHub", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    hooks.prs = two();
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(`${PrRowTestId.Root}-2`));
    expect(hooks.replace).toHaveBeenCalledWith(
      `/inbox/pull-requests?pr=${encodeURIComponent(urlOf(2))}`,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("the title is a focusable button that selects the PR once", () => {
    hooks.prs = two();
    renderWithProviders(<InboxPrsScreen />);
    const title = within(screen.getByTestId(`${PrRowTestId.Root}-2`)).getByTestId(
      PrRowTestId.Title,
    );
    expect(title).toHaveRole("button");
    title.focus();
    expect(title).toHaveFocus();
    fireEvent.click(title);
    expect(hooks.replace).toHaveBeenCalledTimes(1);
  });

  it("pins the master–detail grid height at lg; the diff body is the only scroll area", async () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: { diff: "x", truncated: false } };
    renderWithProviders(<InboxPrsScreen />);
    const detail = screen.getByTestId(InboxPrsScreenTestId.Detail);
    const grid = detail.parentElement as HTMLElement;
    expect(grid).toHaveAttribute("data-testid", GridTestId.Root);
    expect(grid.className).toContain("lg:h-(--grid-lg-height)");
    expect(detail.style.display).toBe("flex");
    const root = screen.getByTestId(PrDetailTestId.Root);
    expect(root.style.minHeight).toBe("0");
    expect(screen.getByTestId(PrDetailTestId.Header).style.flexShrink).toBe("0");
    const body = screen.getByTestId(PrDetailTestId.Body);
    expect(body.style.overflowY).toBe("auto");
    expect(body.style.minHeight).toBe("0");
    expect(body).toContainElement(await screen.findByTestId("pr-diff"));
  });

  it("keeps the loading state inside the scroll body", () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: undefined, isPending: true };
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Body)).toContainElement(
      screen.getByTestId(PrDetailTestId.Loading),
    );
  });

  it("a long title wraps beside a non-shrinking tag column", () => {
    const long = "feat/inbox-web-stacked-pr-chains-derived-from-head-and-base-refs-".repeat(3);
    hooks.prs = [
      pr(7, {
        title: long,
        draft: true,
        blocker: "merge-conflict",
        review: "changes-requested",
        ci: "failing",
      }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const row = screen.getByTestId(`${PrRowTestId.Root}-7`);
    const titleText = within(within(row).getByTestId(PrRowTestId.Title)).getByTestId(
      TypographyTestId.Root,
    );
    expect(titleText).toHaveTextContent(long);
    expect(titleText.className).toContain("wrap-anywhere");
    expect(titleText.className).not.toContain("truncate");
    const tags = within(row).getByTestId(PrRowTestId.Tags);
    expect(tags.style.flexShrink).toBe("0");
    expect(tags.style.flexDirection).toBe("column");
    for (const id of [PrRowTestId.Draft, PrRowTestId.Conflict, PrRowTestId.Review, PrRowTestId.Ci])
      expect(tags).toContainElement(within(row).getByTestId(id));
    // The title row aligns to the top so the tags stay top-right while the title wraps.
    expect((tags.parentElement as HTMLElement).style.alignItems).toBe("flex-start");
  });

  it("lists all PRs and shows the selected one's detail", () => {
    select2();
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(`${PrRowTestId.Root}-1`)).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`${PrRowTestId.Root}-2`)).getByTestId(PrRowTestId.Title),
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(screen.getByTestId(`${PrRowTestId.Root}-1`)).getByTestId(PrRowTestId.Title),
    ).not.toHaveAttribute("aria-current");
    // The selected row drops its action strip — the detail pane already has it.
    expect(
      within(screen.getByTestId(`${PrRowTestId.Root}-2`)).queryByTestId(PrActionsTestId.Review),
    ).toBeNull();
    expect(screen.getByTestId(InboxPrsScreenTestId.Detail)).toHaveAttribute("aria-live", "polite");
    const detail = screen.getByTestId(PrDetailTestId.Root);
    expect(detail).toHaveTextContent("#2");
    expect(detail).toHaveTextContent("PR 2");
    expect(screen.getByTestId(PrDetailTestId.GitHub)).toHaveAttribute("href", urlOf(2));
  });

  it("an unknown ?pr= falls back to the placeholder", () => {
    hooks.prs = two();
    hooks.search = `pr=${encodeURIComponent(urlOf(99))}`;
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(InboxPrsScreenTestId.Placeholder)).toBeInTheDocument();
    expect(screen.queryByTestId(PrDetailTestId.Root)).toBeNull();
  });

  it("shows the diff loading state", () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: undefined, isPending: true };
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Loading)).toBeInTheDocument();
  });

  it("shows the diff error and retries", () => {
    select2();
    const refetch = vi.fn();
    hooks.diffQuery = { ...okDiff, data: undefined, isError: true, refetch };
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Error)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(PrDetailTestId.Retry));
    expect(refetch).toHaveBeenCalled();
  });

  it("an empty truncated diff is 'too large'", () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: { diff: "", truncated: true } };
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.TooLarge)).toBeInTheDocument();
  });

  it("a truncated diff shows the notice and the partial diff", async () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: { diff: "x", truncated: true } };
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Truncated)).toBeInTheDocument();
    expect(await screen.findByTestId("pr-diff")).toHaveTextContent("x");
  });

  it("clicking the review split button does not select the PR", () => {
    hooks.prs = [pr(1, { section: "needs-your-review", bucket: "to-review" })];
    renderWithProviders(<InboxPrsScreen />);
    const split = screen.getByTestId(PrActionsTestId.Review);
    fireEvent.click(within(split).getByTestId(DropDownButtonTestId.Primary));
    expect(hooks.replace).not.toHaveBeenCalled();
  });
});

describe("InboxPrsScreen stacked PRs", () => {
  afterEach(() => {
    hooks.search = "";
    hooks.prs = [];
  });

  it("shows each card's place in a stack, linking to the partner PR", () => {
    hooks.prs = [
      pr(1, { headRef: "feat-a", baseRef: "main", section: "ready-to-merge" }),
      pr(2, { headRef: "feat-b", baseRef: "feat-a" }),
    ];
    renderWithProviders(<InboxPrsScreen />);

    const parent = screen.getByTestId(`${PrRowTestId.Root}-1`);
    const waits = within(parent).getByTestId(`${ChainLinksTestId.By}-2`);
    expect(waits).toHaveAttribute(
      "href",
      `/dashboard/inbox/pull-requests?pr=${encodeURIComponent(urlOf(2))}`,
    );
    expect(waits).toHaveTextContent("#2");
    expect(within(parent).queryByTestId(`${ChainLinksTestId.On}-2`)).toBeNull();

    const child = screen.getByTestId(`${PrRowTestId.Root}-2`);
    expect(within(child).getByTestId(`${ChainLinksTestId.On}-1`)).toHaveAttribute(
      "href",
      `/dashboard/inbox/pull-requests?pr=${encodeURIComponent(urlOf(1))}`,
    );
  });

  it("an unstacked PR has no chain line", () => {
    hooks.prs = [pr(1, { headRef: "feat-a", baseRef: "main" })];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.queryByTestId(ChainLinksTestId.Root)).toBeNull();
  });
});
