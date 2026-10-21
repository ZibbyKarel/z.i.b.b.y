import type { InboxPr } from "@zibby/contracts";
import { AnchoredSheetTestId, StackCrumbsTestId, StatCellTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { PrActionsTestId } from "../../../inbox/components/PrActionButtons";
import { PrSheet } from "./PrSheet";

const { hooks } = vi.hoisted(() => ({
  hooks: { prs: [] as InboxPr[], diff: "" },
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
  useAddressInboxPrCommentsMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../inbox/queries", () => ({
  useInboxPrsQuery: () => ({ data: { prs: hooks.prs, errors: [] } }),
  useInboxPrDiffQuery: () => ({
    data: { diff: hooks.diff, truncated: false },
    isPending: false,
  }),
}));
vi.mock("../../../approvals", () => ({
  useApprovalsQuery: () => ({ data: [] }),
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
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

  it("offers the in-app merge only when ready-to-merge; otherwise a dimmed MERGE + MERGE ON GITHUB", () => {
    const { unmount } = show(
      pr(5, { section: "ready-to-merge", blocker: "ready-to-merge", review: "approved" }),
    );
    expect(screen.getByTestId(PrActionsTestId.Merge)).toBeInTheDocument();
    expect(screen.queryByText(/MERGE NA GITHUBU/)).toBeNull();
    unmount();
    show(pr(6, {}));
    expect(screen.queryByTestId(PrActionsTestId.Merge)).toBeNull();
    expect(screen.getByText(/MERGE NA GITHUBU/)).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/6",
    );
    expect(screen.getByText("MERGE")).toHaveAttribute("aria-disabled", "true");
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
    expect(values).toEqual(["POŽADOVÁNY ZMĚNY", "SELHÁVÁ", "+2 −1"]);
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${top.url}`)).toHaveTextContent("#11");
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-${base.url}`)).toHaveTextContent("#10");
    expect(screen.getByText("x.ts")).toBeInTheDocument();
    expect(screen.getByTestId("pr-diff")).toBeInTheDocument();
  });

  it("renders nothing for an unknown PR", () => {
    hooks.prs = [];
    renderWithProviders(<PrSheet anchor={anchor} id="nope" onClose={() => {}} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});
