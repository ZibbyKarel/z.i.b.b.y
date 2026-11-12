import type { InboxPr, InboxPrReviewers } from "@zibby/contracts";
import {
  AnchoredSheetTestId,
  CopyableTestId,
  DialogTestId,
  IconTestId,
  MenuButtonTestId,
  MetricStripTestId,
  StackCrumbsTestId,
  StatCellTestId,
  TabsTestId,
} from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatAboutButtonTestId } from "../../../chat/components/ChatAboutButton";
import { ChatProvider, useChat } from "../../../chat/ChatContext";
import { fireEvent, renderWithProviders, screen, within } from "../../../../test/render";
import { PrActionsTestId } from "../../../inbox/components/PrActionButtons";
import { PrReviewersTestId } from "../../../inbox/components/PrReviewers";
import { EntityRunListTestId } from "../../../runs/components/EntityRunList";
import { PrSheet, PrSheetTestId } from "./PrSheet";

const { hooks, setDraft, closePr } = vi.hoisted(() => ({
  setDraft: vi.fn(),
  closePr: vi.fn(),
  hooks: {
    prs: [] as InboxPr[],
    diff: "",
    items: [] as unknown[],
    reviewers: undefined as InboxPrReviewers | undefined,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="pr-diff" /> }));
vi.mock("../../../inbox/mutations", () => ({
  useReviewInboxPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRebaseInboxPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useFixInboxPrCiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useAddressInboxPrCommentsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitInboxPrReviewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestInboxPrReviewMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetProjectPrDraftMutation: () => ({ mutate: setDraft, isPending: false }),
  useCloseProjectPrMutation: () => ({ mutate: closePr, isPending: false }),
}));
vi.mock("../../../projects/queries", () => ({
  useProjectsQuery: () => ({ data: [{ id: "api", name: "API service" }] }),
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

/** An inbox issue whose run opened `p`. */
const linkedIssue = (p: InboxPr) => ({
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
      prNumber: p.number,
      prUrl: p.url,
    },
  ],
  hidden: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const show = (p: InboxPr, all: InboxPr[] = [p]) => {
  hooks.prs = all;
  return renderWithProviders(<PrSheet anchor={anchor} id={p.url} onClose={() => {}} />);
};

afterEach(() => {
  setDraft.mockReset();
  closePr.mockReset();
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
    show(pr(14, { behind: true, headRef: "feat" }));
    expect(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).getByTestId(PrActionsTestId.Rebase),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId(AnchoredSheetTestId.Footer)).queryAllByRole("button"),
    ).toHaveLength(0);
  });
});

describe("PrSheet content", () => {
  it("renders status, the stack breadcrumb and no stat cells", () => {
    const base = pr(10, { headRef: "base", baseRef: "main" });
    const top = pr(11, {
      headRef: "top",
      baseRef: "base",
      ci: "failing",
      review: "changes-requested",
    });
    show(top, [base, top]);
    expect(screen.getByTestId(AnchoredSheetTestId.State)).toHaveTextContent("CI FAILING");
    expect(screen.queryByTestId(StatCellTestId.Root)).toBeNull();
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${top.url}`)).toHaveTextContent("#11");
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${base.url}`)).toHaveTextContent("#10");
  });

  it("makes the PR number in the header copyable", () => {
    show(pr(11, {}));
    const kind = screen.getByTestId(AnchoredSheetTestId.Kind);
    expect(within(kind).getByTestId(CopyableTestId.Root)).toHaveTextContent("#11");
    expect(within(kind).getByTestId(CopyableTestId.Copy)).toHaveAccessibleName(
      "Kopírovat číslo PR",
    );
  });

  it("shows only head → base under the title, both copyable, then the coloured diffstat", () => {
    hooks.diff = ["diff --git a/x.ts b/x.ts", "@@ -1 +1,2 @@", "-a", "+b", "+c"].join("\n");
    show(pr(11, { headRef: "feat/x", baseRef: "main" }));
    const meta = screen.getByTestId(AnchoredSheetTestId.Meta);
    expect(within(meta).getByTestId(PrSheetTestId.HeadRef)).toHaveTextContent("feat/x");
    expect(within(meta).getByTestId(PrSheetTestId.BaseRef)).toHaveTextContent("main");
    expect(within(meta).getAllByTestId(CopyableTestId.Copy)).toHaveLength(2);
    expect(within(meta).getByTestId(PrSheetTestId.Added)).toHaveTextContent("+2");
    expect(within(meta).getByTestId(PrSheetTestId.Added).className).toContain("text-ok");
    expect(within(meta).getByTestId(PrSheetTestId.Removed)).toHaveTextContent("−1");
    expect(within(meta).getByTestId(PrSheetTestId.Removed).className).toContain("text-bad");
    expect(within(meta).getByTestId(PrSheetTestId.Files)).toHaveTextContent("1 soubor");
    expect(screen.queryByTestId(AnchoredSheetTestId.Chip)).toBeNull();
  });

  it("orders the summary Stav | Kontroly | Issue | Autor | Projekt", () => {
    const p = pr(32, { authorName: "Me Myself", author: "me" });
    hooks.items = [linkedIssue(p)];
    show(p);
    const items = within(screen.getByTestId(PrSheetTestId.Summary))
      .getAllByTestId(/^metric-strip-item-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(items).toEqual(
      ["state", "checks", "issue", "author", "project"].map(
        (id) => `${MetricStripTestId.Item}-${id}`,
      ),
    );
    const author = screen.getByTestId(`${MetricStripTestId.Item}-author`);
    expect(author).toHaveTextContent("Autor");
    expect(author).toHaveTextContent("Me Myself");
    const project = screen.getByTestId(`${MetricStripTestId.Item}-project`);
    expect(project).toHaveTextContent("API service");
    expect(project).toHaveTextContent("acme/api");
    expect(screen.getByTestId(`${MetricStripTestId.Item}-issue`)).toHaveTextContent("ZB-9");
  });

  it("drops the Issue column when no issue is linked", () => {
    show(pr(33, {}));
    expect(screen.queryByTestId(`${MetricStripTestId.Item}-issue`)).toBeNull();
    expect(screen.getByTestId(MetricStripTestId.Root)).toHaveClass("grid-cols-4");
  });

  it("shows review state and checks with status icons", () => {
    show(pr(30, { ci: "passing", review: "approved" }));
    const state = screen.getByTestId(`${MetricStripTestId.Item}-state`);
    expect(state).toHaveTextContent("Schváleno");
    expect(within(state).getByTestId(IconTestId.Root).getAttribute("class")).toContain("text-ok");
    const checks = screen.getByTestId(`${MetricStripTestId.Item}-checks`);
    expect(checks).toHaveTextContent("Prošlo");
    expect(within(checks).getByTestId(IconTestId.Root).getAttribute("class")).toContain("text-ok");
  });

  it("uses bad/run icons for failing/pending checks", () => {
    const { unmount } = show(pr(31, { ci: "failing" }));
    const icon = () =>
      within(screen.getByTestId(`${MetricStripTestId.Item}-checks`))
        .getByTestId(IconTestId.Root)
        .getAttribute("class");
    expect(icon()).toContain("text-bad");
    unmount();
    show(pr(32, { ci: "pending" }));
    expect(icon()).toContain("text-run");
  });

  it("puts Fix CI into the checks summary when CI is red, not into the header", () => {
    const { unmount } = show(pr(14, { ci: "failing", headRef: "feat" }));
    const checks = screen.getByTestId(`${MetricStripTestId.Item}-checks`);
    expect(within(checks).getByTestId(PrActionsTestId.FixCi)).toBeInTheDocument();
    expect(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).queryByTestId(PrActionsTestId.FixCi),
    ).toBeNull();
    unmount();
    show(pr(15, { ci: "passing", headRef: "feat" }));
    expect(screen.queryByTestId(PrActionsTestId.FixCi)).toBeNull();
  });

  it("offers convert-to-draft / ready-for-review on my PR by its draft state", () => {
    const { unmount } = show(pr(40, {}));
    const state = screen.getByTestId(`${MetricStripTestId.Item}-state`);
    fireEvent.click(within(state).getByTestId(PrSheetTestId.DraftToggle));
    expect(screen.getByTestId(PrSheetTestId.DraftToggle)).toHaveTextContent("Převést na draft");
    expect(setDraft).toHaveBeenCalledWith(
      { params: { id: "api", number: 40 }, body: { draft: true } },
      expect.anything(),
    );
    unmount();
    const second = show(pr(41, { draft: true }));
    fireEvent.click(screen.getByTestId(PrSheetTestId.DraftToggle));
    expect(screen.getByTestId(PrSheetTestId.DraftToggle)).toHaveTextContent("Připravit k review");
    expect(setDraft).toHaveBeenLastCalledWith(
      { params: { id: "api", number: 41 }, body: { draft: false } },
      expect.anything(),
    );
    second.unmount();
    show(pr(42, { bucket: "to-review", section: "needs-your-review" }));
    expect(screen.queryByTestId(PrSheetTestId.DraftToggle)).toBeNull();
  });

  it("closes the PR from the ⋯ menu only after confirming", () => {
    show(pr(50, {}));
    fireEvent.click(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).getByTestId(MenuButtonTestId.Trigger),
    );
    fireEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-close`));
    expect(closePr).not.toHaveBeenCalled();
    const dialog = screen.getByTestId(DialogTestId.Root);
    expect(dialog).toHaveTextContent("Zavřít PR #50?");
    fireEvent.click(
      within(screen.getByTestId(DialogTestId.Footer)).getByRole("button", {
        name: "Zavřít pull request",
      }),
    );
    expect(closePr).toHaveBeenCalledWith(
      { params: { id: "api", number: 50 }, body: {} },
      expect.anything(),
    );
  });

  it("has no ⋯ menu on someone else's PR", () => {
    show(pr(51, { bucket: "to-review", section: "needs-your-review" }));
    expect(screen.queryByTestId(MenuButtonTestId.Trigger)).toBeNull();
  });

  it("tabs: Overview renders the description, Changes the diff", () => {
    hooks.diff = ["diff --git a/x.ts b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");
    show(pr(60, { body: "## What\n\nFixes **it**." }));
    const overview = screen.getByTestId(PrSheetTestId.Overview);
    expect(overview).toHaveTextContent("What");
    expect(overview).toHaveTextContent("Fixes it.");
    expect(screen.queryByTestId("pr-diff")).toBeNull();
    fireEvent.click(screen.getByTestId(`${TabsTestId.Tab}-changes`));
    expect(screen.getByTestId(PrSheetTestId.Changes)).toContainElement(
      screen.getByTestId("pr-diff"),
    );
    expect(screen.queryByTestId(PrSheetTestId.Overview)).toBeNull();
  });

  it("Overview says so when the PR has no description", () => {
    show(pr(61, {}));
    expect(screen.getByTestId(PrSheetTestId.Overview)).toHaveTextContent("PR nemá žádný popis.");
  });

  it("title links to GitHub in a new tab; no open-on-GitHub button", () => {
    const p = pr(12, {});
    show(p);
    const link = screen.getByTestId(AnchoredSheetTestId.TitleLink);
    expect(link).toHaveAttribute("href", p.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/Otevřít na GitHubu/)).toBeNull();
  });

  it("has no details panel", () => {
    show(pr(13, { ci: "failing" }));
    expect(screen.queryByText("Detaily")).toBeNull();
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
    hooks.items = [linkedIssue(p)];
    hooks.prs = [p];
    const onOpen = vi.fn();
    renderWithProviders(<PrSheet anchor={anchor} id={p.url} onClose={() => {}} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId(PrSheetTestId.IssueLink));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "issue", id: "api/i1", widgetId: "issues" }),
    );
  });
});
