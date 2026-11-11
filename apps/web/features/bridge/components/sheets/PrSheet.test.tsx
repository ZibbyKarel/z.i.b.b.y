import type { InboxPr, InboxPrReviewers } from "@zibby/contracts";
import {
  AnchoredSheetTestId,
  DropDownButtonTestId,
  IconTestId,
  StackCrumbsTestId,
  StatCellTestId,
  TypographyTestId,
} from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatAboutButtonTestId } from "../../../chat/components/ChatAboutButton";
import { ChatProvider, useChat } from "../../../chat/ChatContext";
import { fireEvent, renderWithProviders, screen, within } from "../../../../test/render";
import { PrActionsTestId } from "../../../inbox/components/PrActionButtons";
import { PrReviewersTestId } from "../../../inbox/components/PrReviewers";
import { EntityRunListTestId } from "../../../runs/components/EntityRunList";
import { PrSheet } from "./PrSheet";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    prs: [] as InboxPr[],
    diff: "",
    items: [] as unknown[],
    reviewers: undefined as InboxPrReviewers | undefined,
    reviewMutate: (() => {}) as (vars: unknown, opts?: { onError?: (e: unknown) => void }) => void,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="pr-diff" /> }));
vi.mock("../../../inbox/mutations", () => ({
  useReviewInboxPrMutation: () => ({ mutate: hooks.reviewMutate, isPending: false }),
  useRebaseInboxPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useFixInboxPrCiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useAddressInboxPrCommentsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitInboxPrReviewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestInboxPrReviewMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../inbox/queries", () => ({
  useInboxItemsQuery: () => ({ data: { items: hooks.items, epics: [] } }),
  useInboxPrsQuery: () => ({ data: { prs: hooks.prs, errors: [] } }),
  useInboxPrThreadsQuery: () => ({ data: [] }),
  useInboxPrReviewersQuery: () => ({ data: hooks.reviewers }),
  useInboxPrDiffQuery: () => ({
    data: { diff: hooks.diff, truncated: false },
    isPending: false,
  }),
}));

const anchor = {
  side: "r",
  left: 400,
  width: 800,
  top: 0,
  height: 700,
  eL: -2,
  eT: 40,
  eH: 30,
} as const;

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

const show = (p: InboxPr, all: InboxPr[] = [p]) => {
  hooks.prs = all;
  return renderWithProviders(<PrSheet anchor={anchor} id={p.url} onClose={() => {}} />);
};

afterEach(() => {
  hooks.prs = [];
  hooks.diff = "";
  hooks.items = [];
  hooks.reviewers = undefined;
});

describe("PrSheet action buttons", () => {
  it("shows the code-review button exactly when the PR is a review request (isReview)", () => {
    const { unmount } = show(pr(1, { bucket: "to-review", section: "needs-your-review" }));
    expect(screen.getByTestId(PrActionsTestId.Review)).toBeInTheDocument();
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
    unmount();
    show(pr(2, {}));
    expect(screen.queryByTestId(PrActionsTestId.Review)).toBeNull();
  });

  it("review-scope: a refused review (none of my teams' files) shows the reason", () => {
    hooks.reviewMutate = (_vars, opts) =>
      opts?.onError?.({ status: 422, body: { message: "None of the 2 changed files" } });
    show(pr(9, { bucket: "to-review", section: "needs-your-review" }));
    fireEvent.click(
      within(screen.getByTestId(PrActionsTestId.Review)).getByTestId(DropDownButtonTestId.Primary),
    );
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Code-review odmítnuto: None of the 2 changed files",
    );
    hooks.reviewMutate = () => {};
  });

  it("shows address-comments exactly when my PR has open threads (isFix)", () => {
    const { unmount } = show(pr(3, { headRef: "feat", unresolvedThreads: 2 }));
    expect(screen.getByTestId(PrActionsTestId.Address)).toBeInTheDocument();
    expect(screen.queryByTestId(PrActionsTestId.Review)).toBeNull();
    unmount();
    show(pr(4, { headRef: "feat", unresolvedThreads: 0 }));
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
  });

  it("shows only review actions on someone else's PR", () => {
    show(
      pr(20, {
        bucket: "to-review",
        ci: "failing",
        behind: true,
        section: "ready-to-merge",
        headRef: "f",
      }),
    );
    for (const id of [
      PrActionsTestId.Rebase,
      PrActionsTestId.FixCi,
      PrActionsTestId.Merge,
      PrActionsTestId.Address,
    ])
      expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId(PrActionsTestId.Review)).toBeInTheDocument();
    expect(screen.queryByText(/Merge na GitHubu/)).toBeNull();
  });

  it("offers the in-app merge only when ready-to-merge; otherwise no merge action (no GitHub link)", () => {
    const { unmount } = show(
      pr(5, { section: "ready-to-merge", blocker: "ready-to-merge", review: "approved" }),
    );
    expect(screen.getByTestId(PrActionsTestId.Merge)).toBeInTheDocument();
    expect(screen.queryByText(/Merge na GitHubu/)).toBeNull();
    unmount();
    show(pr(6, {}));
    expect(screen.queryByTestId(PrActionsTestId.Merge)).toBeNull();
    expect(screen.queryByText(/Merge na GitHubu/)).toBeNull();
    expect(screen.queryByRole("link", { name: /merge/i })).toBeNull();
    expect(screen.queryByText("Merge")).toBeNull();
  });
});

describe("PrSheet header actions", () => {
  it("puts the action buttons in the sheet header, not the footer", () => {
    show(pr(14, { ci: "failing", headRef: "feat" }));
    expect(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).getByTestId(PrActionsTestId.FixCi),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId(AnchoredSheetTestId.Footer)).queryAllByRole("button"),
    ).toHaveLength(0);
  });
});

describe("PrSheet content", () => {
  it("renders status, stat cells, the diff file list and the stack breadcrumb", () => {
    hooks.diff = ["diff --git a/x.ts b/x.ts", "@@ -1 +1,2 @@", "-a", "+b", "+c"].join("\n");
    const base = pr(10, { headRef: "base", baseRef: "main" });
    const top = pr(11, {
      headRef: "top",
      baseRef: "base",
      ci: "failing",
      review: "changes-requested",
    });
    show(top, [base, top]);
    expect(screen.getByTestId(AnchoredSheetTestId.State)).toHaveTextContent("CI FAILING");
    const values = screen.getAllByTestId(StatCellTestId.Value).map((v) => v.textContent);
    expect(values).toEqual(["Požadovány změny", "Selhává", "+2 −1"]);
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${top.url}`)).toHaveTextContent("#11");
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${base.url}`)).toHaveTextContent("#10");
    expect(screen.getByTestId("pr-diff")).toBeInTheDocument();
  });

  it("shows green approved/passing cells with status icons and coloured +/- counts", () => {
    hooks.diff = ["diff --git a/x.ts b/x.ts", "@@ -1 +1,2 @@", "-a", "+b", "+c"].join("\n");
    show(pr(30, { ci: "passing", review: "approved" }));
    const [review, checks, changes] = screen.getAllByTestId(StatCellTestId.Root) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    for (const cell of [review, checks]) {
      expect(cell.className).toContain("border-b-state-done");
      expect(within(cell).getByTestId(StatCellTestId.Icon)).toContainElement(
        within(cell).getByTestId(IconTestId.Root),
      );
      expect(within(cell).getByTestId(IconTestId.Root).getAttribute("class")).toContain("text-ok");
    }
    expect(within(changes).queryByTestId(StatCellTestId.Icon)).toBeNull();
    const [add, del] = within(changes).getAllByTestId(TypographyTestId.Root);
    expect(add).toHaveTextContent("+2");
    expect(add?.className).toContain("text-ok");
    expect(del).toHaveTextContent("−1");
    expect(del?.className).toContain("text-bad");
  });

  it("uses bad/run icons for failing/pending checks", () => {
    const { unmount } = show(pr(31, { ci: "failing" }));
    expect(
      within(screen.getAllByTestId(StatCellTestId.Root)[1]!)
        .getByTestId(IconTestId.Root)
        .getAttribute("class"),
    ).toContain("text-bad");
    unmount();
    show(pr(32, { ci: "pending" }));
    expect(
      within(screen.getAllByTestId(StatCellTestId.Root)[1]!)
        .getByTestId(IconTestId.Root)
        .getAttribute("class"),
    ).toContain("text-run");
  });

  it("title links to GitHub in a new tab; no open-on-GitHub button", () => {
    const p = pr(12, {});
    show(p);
    const link = screen.getByTestId(AnchoredSheetTestId.TitleLink);
    expect(link).toHaveAttribute("href", p.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/Otevřít na GitHubu/)).toBeNull();
  });

  it("has no details or checks panel", () => {
    show(pr(13, { ci: "failing" }));
    expect(screen.queryByText("Detaily")).toBeNull();
    expect(screen.queryByText(/Větev/)).toBeNull();
    expect(screen.getAllByTestId(StatCellTestId.Value)).toHaveLength(3);
  });

  it("renders nothing for an unknown PR", () => {
    hooks.prs = [];
    renderWithProviders(<PrSheet anchor={anchor} id="nope" onClose={() => {}} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});

describe("PrSheet chat about", () => {
  it("opens the chat about the PR", () => {
    const p = pr(7, { headRef: "feat" });
    hooks.prs = [p];
    function Probe() {
      return <span data-testid="probe">{useChat().about?.id ?? ""}</span>;
    }
    renderWithProviders(
      <ChatProvider>
        <PrSheet anchor={anchor} id={p.url} onClose={() => {}} />
        <Probe />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByTestId(ChatAboutButtonTestId.Root));
    expect(screen.getByTestId("probe")).toHaveTextContent(p.url);
  });
});

describe("PrSheet runs and issue link", () => {
  it("lists the PR's runs newest first, latest marked; a row opens the run", () => {
    const onOpen = vi.fn();
    const p = pr(30, {
      runs: [
        {
          taskId: "t2",
          runRef: "run-2",
          kind: "review",
          state: "awaiting-approval",
          startedAt: "2026-01-02T00:00:00.000Z",
        },
        { taskId: "t1", kind: "fix-ci", state: "failed", startedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    hooks.prs = [p];
    renderWithProviders(<PrSheet anchor={anchor} id={p.url} onClose={() => {}} onOpen={onOpen} />);
    const rows = screen.getAllByTestId(EntityRunListTestId.Row);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId(EntityRunListTestId.Latest)).toBeInTheDocument();
    expect(within(rows[1]!).queryByTestId(EntityRunListTestId.Latest)).toBeNull();
    fireEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", id: "run-2", key: "runs:run-2" }),
    );
    fireEvent.click(rows[1]!);
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("renders no approval card and no runs section without runs", () => {
    show(pr(31, {}));
    expect(screen.queryByTestId(EntityRunListTestId.Root)).toBeNull();
  });

  it("shows the reviewers tree next to the runs, and alone without runs", () => {
    hooks.reviewers = {
      teams: [],
      users: [{ login: "ann", state: "approved", commented: false }],
    };
    const { unmount } = show(
      pr(32, {
        runs: [
          { taskId: "t1", kind: "fix-ci", state: "failed", startedAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    );
    const reviewers = screen.getByTestId(PrReviewersTestId.Root);
    // Same row as the runs, as its last (right-most) child.
    const row = reviewers.parentElement!;
    expect(row).toContainElement(screen.getByTestId(EntityRunListTestId.Root));
    expect(row.lastElementChild).toBe(reviewers);
    unmount();
    show(pr(33, {}));
    expect(screen.getByTestId(PrReviewersTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(EntityRunListTestId.Root)).toBeNull();
  });

  it("links the issue that owns the PR and opens its sheet", () => {
    const p = pr(32, {});
    hooks.items = [
      {
        id: "i1",
        projectId: "api",
        name: "Fix",
        lifecycle: "pr-open",
        source: { kind: "jira", externalKey: "ZB-9", url: null },
        project: { id: "api", name: "API" },
        runs: [
          {
            taskId: "t",
            startedAt: "2026-01-01T00:00:00.000Z",
            outcome: "awaiting-merge",
            prNumber: 32,
            prUrl: p.url,
          },
        ],
        hidden: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    hooks.prs = [p];
    const onOpen = vi.fn();
    renderWithProviders(<PrSheet anchor={anchor} id={p.url} onClose={() => {}} onOpen={onOpen} />);
    fireEvent.click(screen.getByText(/ZB-9/));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "issue", id: "api/i1", widgetId: "issues" }),
    );
  });
});
