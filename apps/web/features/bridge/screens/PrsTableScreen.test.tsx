import type { InboxPr } from "@zibby/contracts";
import { DataTableTestId } from "@zibby/design-system";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { PrsTableScreen, PrsTableScreenTestId } from "./PrsTableScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/activity/pull-requests",
  useSearchParams: () => new URLSearchParams(),
}));

const q = vi.hoisted(() => ({
  prs: [] as InboxPr[],
  isPending: false,
  isError: false,
}));
vi.mock("../../inbox/queries", () => ({
  useInboxPrsQuery: () => ({
    data: { prs: q.prs, errors: [] },
    isPending: q.isPending,
    isError: q.isError,
    refetch: vi.fn(),
  }),
}));
vi.mock("../state/useBridgeInboxFilters", () => ({
  useBridgeInboxFilters: () => ({ company: [], team: [], project: [] }),
}));

const pr = (number: number, over: Partial<InboxPr> = {}): InboxPr => ({
  source: "github",
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  repo: "o/orders",
  author: "karel",
  createdAt: new Date(Date.now() - 7200_000).toISOString(),
  draft: false,
  ci: "passing",
  review: "none",
  mergeable: true,
  bucket: "mine",
  blocker: "awaiting-review",
  section: "waiting",
  projectId: "p1",
  ...over,
});

const key = (n: number) => `https://github.com/o/r/pull/${n}`;

describe("PrsTableScreen (todo-18)", () => {
  beforeEach(() => {
    q.prs = [];
    q.isPending = false;
    q.isError = false;
    push.mockClear();
  });

  it("lists the PRs with stacked ones nested under their base", () => {
    q.prs = [
      pr(1, { headRef: "feat-a", baseRef: "main" }),
      pr(2, { headRef: "feat-b", baseRef: "feat-a", title: "Stacked" }),
      pr(3, { headRef: "other", baseRef: "main" }),
    ];
    render(<PrsTableScreen />);
    expect(screen.getByTestId(PrsTableScreenTestId.Count)).toHaveTextContent("03");
    expect(screen.getByTestId(`${DataTableTestId.Cell}-${key(2)}-pr`)).toHaveAttribute(
      "data-depth",
      "1",
    );
    expect(screen.getByTestId(`${DataTableTestId.Cell}-${key(1)}-pr`)).not.toHaveAttribute(
      "data-depth",
    );
    expect(screen.getByTestId(`${DataTableTestId.Cell}-${key(2)}-pr`)).toHaveTextContent("Stacked");
    expect(screen.getByTestId(`${DataTableTestId.Cell}-${key(1)}-author`)).toHaveTextContent(
      "karel",
    );
  });

  it("opens the PR in the inbox detail on row click", () => {
    q.prs = [pr(7)];
    render(<PrsTableScreen />);
    fireEvent.click(screen.getByTestId(`${DataTableTestId.Row}-${key(7)}`));
    expect(push).toHaveBeenCalledWith(
      `/dashboard/inbox/pull-requests?pr=${encodeURIComponent(key(7))}`,
    );
  });

  it("shows an empty state with no PRs", () => {
    render(<PrsTableScreen />);
    expect(screen.getByTestId(DataTableTestId.Empty)).toBeInTheDocument();
  });
});
