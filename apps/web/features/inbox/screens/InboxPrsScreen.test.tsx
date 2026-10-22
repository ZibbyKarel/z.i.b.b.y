import type { InboxPr } from "@zibby/contracts";
import { within } from "@testing-library/react";
import {
  DropDownButtonTestId,
  GridTestId,
  IndentRailTestId,
  TypographyTestId,
} from "@zibby/design-system";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { PrDetailTestId } from "../components/PrDetail";
import { PrActionsTestId } from "../components/PrActions";
import { PrRowTestId } from "../components/PrRow";
import { PrStackPathTestId } from "../components/PrStackPath";
import { InboxPrsScreen, InboxPrsScreenTestId } from "./InboxPrsScreen";

const { hooks, review, merge, rebase } = vi.hoisted(() => ({
  hooks: {
    prs: [] as unknown[],
    items: [] as unknown[],
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
    data: { items: hooks.items, epics: [], syncProjectIds: ["api"], errors: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInboxPrDiffQuery: () => hooks.diffQuery,
  useInboxPrThreadsQuery: () => ({ data: [], isError: false }),
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
  useAddressInboxPrCommentsMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
const toReview = { bucket: "to-review", section: "needs-your-review" } as const;

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

beforeEach(() => {
  hooks.diffQuery = okDiff;
});

describe("InboxPrsScreen list", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    hooks.search = "";
    hooks.replace.mockClear();
    vi.restoreAllMocks();
    review.mockReset();
  });

  it("groups a stack under its root, kids indented and sorted by number", () => {
    hooks.prs = [
      pr(3, { headRef: "c", baseRef: "b" }),
      pr(1, { headRef: "a", baseRef: "main" }),
      pr(2, { headRef: "b", baseRef: "a" }),
      pr(9, {}),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const group = screen.getByTestId(`${InboxPrsScreenTestId.Group}-1`);
    const rail = within(group).getByTestId(IndentRailTestId.Root);
    expect(
      within(rail)
        .getAllByTestId(/^inbox-pr-row-/)
        .map((r) => r.dataset.testid),
    ).toEqual(["inbox-pr-row-2", "inbox-pr-row-3"]);
    expect(screen.getByTestId(`${InboxPrsScreenTestId.Group}-9`)).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`${InboxPrsScreenTestId.Group}-9`)).queryByTestId(
        IndentRailTestId.Root,
      ),
    ).toBeNull();
  });

  it("the list header counts the visible PRs, zero-padded", () => {
    hooks.prs = [pr(1, {}), pr(2, {})];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(InboxPrsScreenTestId.List)).toHaveTextContent("Pull requesty");
    expect(screen.getByTestId(InboxPrsScreenTestId.Count)).toHaveTextContent("02");
  });

  it("a card shows one state label, ON #parent and WAITS ON the unready ancestors", () => {
    hooks.prs = [
      pr(1, { headRef: "a", baseRef: "main", blocker: "changes-requested" }),
      pr(2, { headRef: "b", baseRef: "a" }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const kid = screen.getByTestId(`${PrRowTestId.Root}-2`);
    expect(within(kid).getByTestId(PrRowTestId.State)).toHaveTextContent(/čeká na review/i);
    expect(within(kid).getByTestId(PrRowTestId.On)).toHaveTextContent("#1");
    expect(within(kid).getByTestId(PrRowTestId.Waits)).toHaveTextContent("#1");
    const root = screen.getByTestId(`${PrRowTestId.Root}-1`);
    expect(within(root).getByTestId(PrRowTestId.State)).toHaveTextContent(/požadovány změny/i);
    expect(within(root).queryByTestId(PrRowTestId.On)).toBeNull();
    expect(within(root).queryByTestId(PrRowTestId.Waits)).toBeNull();
  });

  it("a kid whose parent is filtered out is its own group and still says ON #parent", () => {
    hooks.prs = [
      pr(1, { headRef: "a", baseRef: "main", projectId: "web" }),
      pr(2, { headRef: "b", baseRef: "a" }),
    ];
    hooks.search = "project=api";
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.queryByTestId(`${PrRowTestId.Root}-1`)).toBeNull();
    expect(screen.getByTestId(`${InboxPrsScreenTestId.Group}-2`)).toBeInTheDocument();
    const kid = screen.getByTestId(`${PrRowTestId.Root}-2`);
    expect(within(kid).getByTestId(PrRowTestId.On)).toHaveTextContent("#1");
    expect(screen.getByTestId(InboxPrsScreenTestId.Count)).toHaveTextContent("01");
  });

  it("selects the first group's root when no ?pr= is set, and when ?pr= is unknown", () => {
    hooks.prs = [pr(5, { blocker: "awaiting-review" }), pr(6, { blocker: "ci-failing" })];
    const first = renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Root)).toHaveTextContent("PR 6");
    expect(
      within(screen.getByTestId(`${PrRowTestId.Root}-6`)).getByTestId(PrRowTestId.Title),
    ).toHaveAttribute("aria-current", "true");
    first.unmount();
    hooks.search = `pr=${encodeURIComponent(urlOf(99))}`;
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Root)).toHaveTextContent("PR 6");
    expect(hooks.replace).not.toHaveBeenCalled();
  });

  it("?pr= of a filtered-out PR still opens it", () => {
    hooks.prs = [pr(1, { projectId: "web" }), pr(2, {})];
    hooks.search = `project=api&pr=${encodeURIComponent(urlOf(1))}`;
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.queryByTestId(`${PrRowTestId.Root}-1`)).toBeNull();
    expect(screen.getByTestId(PrDetailTestId.Root)).toHaveTextContent("PR 1");
  });

  it("no PRs → empty state and no detail", () => {
    hooks.prs = [];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(InboxPrsScreenTestId.Empty)).toHaveTextContent("Žádné pull requesty");
    expect(screen.queryByTestId(PrDetailTestId.Root)).toBeNull();
  });

  it("offers code review on review requests, merge only when ready to merge", () => {
    hooks.prs = [
      pr(1, { section: "needs-your-review", bucket: "to-review" }),
      pr(2, { section: "needs-team-review", bucket: "to-review", reviewReason: "team" }),
      pr(3, { section: "waiting" }),
      pr(5, { section: "ready-to-merge", blocker: "ready-to-merge" }),
    ];
    renderWithProviders(<InboxPrsScreen />);
    const has = (n: number, id: string) =>
      within(screen.getByTestId(`${PrRowTestId.Root}-${n}`)).queryByTestId(id) !== null;
    expect([1, 2, 3, 5].map((n) => has(n, PrActionsTestId.Review))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect([1, 2, 3, 5].map((n) => has(n, PrActionsTestId.Merge))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect([1, 2, 3, 5].map((n) => has(n, PrRowTestId.Actions))).toEqual([true, true, false, true]);
  });

  it("clicking in the action row never selects the card", () => {
    hooks.prs = [pr(5, { section: "ready-to-merge" }), pr(1, toReview)];
    renderWithProviders(<InboxPrsScreen />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.DeleteBranch));
    fireEvent.click(
      within(screen.getByTestId(PrActionsTestId.Review)).getByTestId(DropDownButtonTestId.Primary),
    );
    expect(hooks.replace).not.toHaveBeenCalled();
  });
});

describe("InboxPrsScreen master–detail", () => {
  afterEach(() => {
    hooks.search = "";
    hooks.items = [];
    hooks.replace.mockClear();
    vi.restoreAllMocks();
  });

  it("the detail header shows meta, chips and the item link", () => {
    hooks.prs = [pr(7, { ci: "failing", review: "changes-requested", blocker: "ci-failing" })];
    hooks.items = [
      {
        id: "i7",
        projectId: "api",
        level: "task",
        name: "Item 7",
        description: "",
        source: { kind: "jira", integrationId: "jira-1", externalId: "7", externalKey: "API-7" },
        attachments: [],
        dependsOn: [],
        dependsOnFromSource: [],
        lifecycle: "todo",
        runs: [],
        syncNotes: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        project: { id: "api", name: "api" },
        hidden: false,
        linkedPr: { number: 7, url: urlOf(7) },
      },
    ];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.Header)).toHaveTextContent("acme/api · #7 · me");
    expect(screen.getByTestId(PrDetailTestId.StateChip)).toHaveTextContent(/ci selhává/i);
    expect(screen.getByTestId(PrDetailTestId.CiChip)).toHaveTextContent("✗");
    expect(screen.getByTestId(PrDetailTestId.ReviewChip)).toHaveTextContent(/požadovány změny/i);
    expect(screen.getByTestId(PrDetailTestId.Item)).toHaveTextContent("API-7");
    expect(screen.getByTestId(PrDetailTestId.Item)).toHaveAttribute(
      "href",
      "/dashboard/inbox/issues/api/i7",
    );
  });

  it("a stacked PR shows MAIN ← #1 ← #2, NEXT ON TOP and what it waits on; steps select", () => {
    hooks.prs = [
      pr(1, { headRef: "a", baseRef: "main", blocker: "changes-requested" }),
      pr(2, { headRef: "b", baseRef: "a" }),
      pr(3, { headRef: "c", baseRef: "b" }),
    ];
    hooks.search = `pr=${encodeURIComponent(urlOf(2))}`;
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrStackPathTestId.Base)).toHaveTextContent(/main/i);
    expect(screen.getByTestId(`${PrStackPathTestId.Step}-1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${PrStackPathTestId.Step}-2`)).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId(`${PrStackPathTestId.Next}-3`)).toBeInTheDocument();
    expect(screen.getByTestId(PrDetailTestId.WaitText)).toHaveTextContent(
      "Mergne se po #1 (požadovány změny).",
    );
    expect(screen.getByTestId(PrDetailTestId.DiffLabel)).toHaveTextContent("#1");
    fireEvent.click(screen.getByTestId(`${PrStackPathTestId.Step}-1`));
    expect(hooks.replace).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(urlOf(1))),
    );
    fireEvent.click(screen.getByTestId(`${PrStackPathTestId.Next}-3`));
    expect(hooks.replace).toHaveBeenLastCalledWith(
      expect.stringContaining(encodeURIComponent(urlOf(3))),
    );
  });

  it("the bottom of a stack says so; a PR over an approved parent says everything below is approved", () => {
    hooks.prs = [
      pr(1, { headRef: "a", baseRef: "main", blocker: "ready-to-merge" }),
      pr(2, { headRef: "b", baseRef: "a" }),
    ];
    hooks.search = `pr=${encodeURIComponent(urlOf(1))}`;
    const first = renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.WaitText)).toHaveTextContent(
      "Spodek stacku. Cílí na MAIN.",
    );
    first.unmount();
    hooks.search = `pr=${encodeURIComponent(urlOf(2))}`;
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.getByTestId(PrDetailTestId.WaitText)).toHaveTextContent(
      "Vše pod ním je schválené.",
    );
  });

  it("an unstacked PR has no stack block; the diff label names its base branch", () => {
    hooks.prs = [pr(7, { baseRef: "develop" })];
    renderWithProviders(<InboxPrsScreen />);
    expect(screen.queryByTestId(PrStackPathTestId.Root)).toBeNull();
    expect(screen.queryByTestId(PrDetailTestId.Stack)).toBeNull();
    expect(screen.getByTestId(PrDetailTestId.DiffLabel)).toHaveTextContent(/develop/i);
  });
  const two = () => [
    pr(1, { section: "waiting" }),
    pr(2, { section: "needs-your-review", bucket: "to-review" }),
  ];
  const select2 = () => {
    hooks.prs = two();
    hooks.search = `pr=${encodeURIComponent(urlOf(2))}`;
  };

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

  it("a long title wraps", () => {
    const long = "feat/inbox-web-stacked-pr-chains-derived-from-head-and-base-refs-".repeat(3);
    hooks.prs = [pr(7, { title: long })];
    renderWithProviders(<InboxPrsScreen />);
    const row = screen.getByTestId(`${PrRowTestId.Root}-7`);
    const titleText = within(within(row).getByTestId(PrRowTestId.Title)).getByTestId(
      TypographyTestId.Root,
    );
    expect(titleText).toHaveTextContent(long);
    expect(titleText.className).toContain("wrap-anywhere");
    expect(titleText.className).not.toContain("truncate");
  });

  it("pins the master–detail grid height at lg; the diff body is the only scroll area", async () => {
    select2();
    hooks.diffQuery = { ...okDiff, data: { diff: "x", truncated: false } };
    renderWithProviders(<InboxPrsScreen />);
    const detail = screen.getByTestId(InboxPrsScreenTestId.Detail);
    const grid = detail.parentElement as HTMLElement;
    expect(grid).toHaveAttribute("data-testid", GridTestId.Root);
    expect(grid.style.getPropertyValue("--grid-lg-height")).not.toBe("");
    expect(detail.style.display).toBe("flex");
    const root = screen.getByTestId(PrDetailTestId.Root);
    expect(root.style.minHeight).toBe("0");
    expect(screen.getByTestId(PrDetailTestId.Header).style.flexShrink).toBe("0");
    const body = screen.getByTestId(PrDetailTestId.Body);
    expect(body.style.overflowY).toBe("auto");
    expect(body.style.minHeight).toBe("0");
    expect(body).toHaveAttribute("tabindex", "0");
    expect(body).toHaveAttribute("role", "region");
    expect(body).toHaveAccessibleName();
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
    // Actions live on the cards only — the selected card keeps its action row.
    expect(
      within(screen.getByTestId(`${PrRowTestId.Root}-2`)).getByTestId(PrActionsTestId.Review),
    ).toBeInTheDocument();
    expect(screen.getByTestId(InboxPrsScreenTestId.Detail)).toHaveAttribute("aria-live", "polite");
    const detail = screen.getByTestId(PrDetailTestId.Root);
    expect(detail).toHaveTextContent("#2");
    expect(detail).toHaveTextContent("PR 2");
    expect(screen.getByTestId(PrDetailTestId.GitHub)).toHaveAttribute("href", urlOf(2));
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
});
