import type { InboxPr } from "@zibby/contracts";
import { DropDownButtonTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { PrActions, PrActionsTestId, REVIEW_MODE_STORAGE_KEY, hasPrActions } from "./PrActions";

const { hooks, review, merge, rebase, address, fixCi } = vi.hoisted(() => ({
  hooks: { reviewPending: false },
  review: vi.fn(),
  merge: vi.fn(),
  rebase: vi.fn(),
  address: vi.fn(),
  fixCi: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inbox/pull-requests",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../mutations", () => ({
  useReviewInboxPrMutation: () => ({ mutate: review, isPending: hooks.reviewPending }),
  useRebaseInboxPrMutation: () => ({ mutate: rebase, isPending: false }),
  useAddressInboxPrCommentsMutation: () => ({ mutate: address, isPending: false }),
  useFixInboxPrCiMutation: () => ({ mutate: fixCi, isPending: false }),
}));
vi.mock("../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: merge, isPending: false }),
}));

const urlOf = (n: number) => `https://github.com/acme/api/pull/${n}`;
const toReview = { bucket: "to-review", section: "needs-your-review" } as const;

function pr(number: number, over: Partial<InboxPr>): InboxPr {
  return {
    source: "github",
    number,
    title: `PR ${number}`,
    url: urlOf(number),
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

afterEach(() => {
  window.sessionStorage.clear();
  hooks.reviewPending = false;
  vi.restoreAllMocks();
  review.mockReset();
  merge.mockReset();
  rebase.mockReset();
  address.mockReset();
  fixCi.mockReset();
});

describe("PrActions review", () => {
  it("a review request shows REVIEW · <mode>; the menu describes all three modes with ✓ on the current", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(7, toReview)} />);
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toHaveTextContent("Review · Rychlé");
    expect(screen.getByTestId(DropDownButtonTestId.Trigger)).toHaveAccessibleName(
      "Další úrovně code-review",
    );
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    for (const m of ["quick", "tested", "browser"]) {
      expect(screen.getByTestId(`${DropDownButtonTestId.Item}-${m}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId(`${DropDownButtonTestId.Item}-quick`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(`${DropDownButtonTestId.Item}-browser`)).toHaveTextContent(
      /screenshoty/,
    );
  });

  it("picking a mode only selects it (no run); the primary click runs the selected level", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(7, toReview)} />);
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    fireEvent.click(screen.getByTestId(`${DropDownButtonTestId.Item}-browser`));
    expect(review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(review).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 7, title: "PR 7", level: "browser" } },
      expect.anything(),
    );
  });

  it("the primary click starts a quick review by default", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(1, toReview)} />);
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(review).toHaveBeenCalledWith(
      { body: expect.objectContaining({ number: 1, level: "quick" }) },
      expect.anything(),
    );
  });

  it("remembers the mode per PR url for the session; an unknown stored mode reads quick", () => {
    window.sessionStorage.setItem(
      REVIEW_MODE_STORAGE_KEY,
      JSON.stringify({ [urlOf(7)]: "tested", [urlOf(8)]: "thorough" }),
    );
    renderWithProviders(
      <>
        <PrActions baseLabel="main" pr={pr(7, toReview)} />
        <PrActions baseLabel="main" pr={pr(8, toReview)} />
      </>,
    );
    const [seven, eight] = screen.getAllByTestId(DropDownButtonTestId.Primary);
    expect(seven).toHaveTextContent("Důkladné"); // `tested` is labelled Thorough
    expect(eight).toHaveTextContent("Rychlé");
  });

  it("a failed review start shows the error, and a later success clears it", () => {
    review.mockImplementationOnce((_vars, opts: { onError?: () => void }) => opts.onError?.());
    renderWithProviders(<PrActions baseLabel="main" pr={pr(1, toReview)} />);
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Code-review se nepodařilo spustit.",
    );
    review.mockImplementationOnce((_vars, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    fireEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(screen.queryByTestId(PrActionsTestId.Message)).toBeNull();
  });

  it("a pending review request disables the menu trigger too", () => {
    hooks.reviewPending = true;
    renderWithProviders(<PrActions baseLabel="main" pr={pr(1, toReview)} />);
    expect(screen.getByTestId(DropDownButtonTestId.Trigger)).toBeDisabled();
  });

  it("a draft review request still offers review", () => {
    expect(hasPrActions(pr(1, { ...toReview, draft: true }))).toBe(true);
  });
});

describe("PrActions address / rebase", () => {
  it("my PR with changes requested offers ADDRESS REVIEW COMMENTS, which starts it", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { blocker: "changes-requested", review: "changes-requested", headRef: "feat" })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.Address)).toHaveTextContent(
      "Zapracovat review komentáře",
    );
    fireEvent.click(screen.getByTestId(PrActionsTestId.Address));
    expect(address).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 7, title: "PR 7" } },
      expect.anything(),
    );
    expect(screen.queryByTestId(PrActionsTestId.Rebase)).toBeNull();
  });

  it("a fork head (no headRef) gets no Address button", () => {
    renderWithProviders(
      <PrActions baseLabel="main" pr={pr(7, { blocker: "changes-requested" })} />,
    );
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
  });

  it("no unresolved threads left hides the Address button", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { blocker: "changes-requested", headRef: "feat", unresolvedThreads: 0 })}
      />,
    );
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
  });

  it("unresolved threads left keeps the Address button", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { blocker: "changes-requested", headRef: "feat", unresolvedThreads: 2 })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.Address)).toBeInTheDocument();
  });

  it("comment-only review (not changes-requested) with open threads shows Address", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { blocker: "awaiting-review", headRef: "feat", unresolvedThreads: 3 })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.Address)).toBeInTheDocument();
  });

  it("unknown thread count outside changes-requested hides Address", () => {
    renderWithProviders(
      <PrActions baseLabel="main" pr={pr(7, { blocker: "awaiting-review", headRef: "feat" })} />,
    );
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
  });

  it("0 unresolved threads + behind shows Rebase but no Address", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, {
          blocker: "changes-requested",
          headRef: "feat",
          unresolvedThreads: 0,
          behind: true,
        })}
      />,
    );
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toBeInTheDocument();
  });

  it("0 unresolved threads hides Address but a failed run still shows its link", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, {
          blocker: "changes-requested",
          headRef: "feat",
          unresolvedThreads: 0,
          addressComments: { taskId: "t", state: "failed" },
        })}
      />,
    );
    expect(screen.queryByTestId(PrActionsTestId.Address)).toBeNull();
    expect(screen.getByTestId(PrActionsTestId.Failed)).toHaveAttribute("href", "/work/tasks/t");
  });

  it("a refused address shows the server's reason", () => {
    address.mockImplementationOnce((_vars, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.({ status: 422, body: { message: "acme/api#7 comes from a fork" } }),
    );
    renderWithProviders(
      <PrActions baseLabel="main" pr={pr(7, { blocker: "changes-requested", headRef: "feat" })} />,
    );
    fireEvent.click(screen.getByTestId(PrActionsTestId.Address));
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Odmítnuto: acme/api#7 comes from a fork",
    );
  });

  it("a colleague's behind PR shows Review only", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(7, { ...toReview, behind: true })} />);
    expect(screen.getByTestId(DropDownButtonTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(PrActionsTestId.Rebase)).toBeNull();
  });

  it("my conflicting PR with threads shows Address and Rebase", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { mergeable: false, headRef: "feat", unresolvedThreads: 2 })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.Address)).toBeInTheDocument();
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toBeInTheDocument();
  });

  it("REBASE ON <base> only when conflicting or behind — never as a fallback", () => {
    const { rerender } = renderWithProviders(
      <PrActions baseLabel="#12" pr={pr(7, { behind: true })} />,
    );
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toHaveTextContent("Rebase na #12");
    rerender(<PrActions baseLabel="main" pr={pr(7, { mergeable: false })} />);
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toHaveTextContent("Rebase na main");
    rerender(<PrActions baseLabel="main" pr={pr(7, {})} />);
    expect(screen.queryByTestId(PrActionsTestId.Rebase)).toBeNull();
    expect(hasPrActions(pr(7, {}))).toBe(false);
  });

  it("clicking Rebase starts it; a refusal shows the server's reason", () => {
    rebase.mockImplementationOnce((_vars, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.({ status: 422, body: { message: "acme/api#1 comes from a fork" } }),
    );
    renderWithProviders(<PrActions baseLabel="main" pr={pr(1, { mergeable: false })} />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.Rebase));
    expect(rebase).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 1, title: "PR 1" } },
      expect.anything(),
    );
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Rebase odmítnut: acme/api#1 comes from a fork",
    );
  });
});

describe("PrActions runs", () => {
  it.each([
    ["codeReview", { codeReview: { taskId: "t1", state: "running" as const } }, "Review běží"],
    [
      "rebase",
      { rebase: { taskId: "t1", state: "awaiting-approval" as const } },
      "Rebase čeká na schválení",
    ],
    [
      "addressComments",
      { addressComments: { taskId: "t1", state: "running" as const } },
      "Agent zapracovává komentáře",
    ],
  ])(
    "an in-flight %s replaces the buttons with a running label linked to its task",
    (_k, over, label) => {
      renderWithProviders(
        <PrActions baseLabel="main" pr={pr(7, { ...over, ...toReview, behind: true })} />,
      );
      const running = screen.getByTestId(PrActionsTestId.Running);
      expect(running).toHaveAttribute("href", "/work/tasks/t1");
      expect(running).toHaveTextContent(label);
      expect(screen.queryByTestId(DropDownButtonTestId.Root)).toBeNull();
      expect(screen.queryByTestId(PrActionsTestId.Rebase)).toBeNull();
    },
  );

  it("a failed run keeps the action and adds a failed link to its task", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { behind: true, rebase: { taskId: "t9", state: "failed" } })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.Rebase)).toBeEnabled();
    expect(screen.getByTestId(PrActionsTestId.Failed)).toHaveAttribute("href", "/work/tasks/t9");
    expect(screen.getByTestId(PrActionsTestId.Failed)).toHaveTextContent("Rebase selhal");
  });

  it("a finished run alone renders nothing", () => {
    expect(hasPrActions(pr(7, { rebase: { taskId: "t9", state: "pushed" } }))).toBe(false);
  });

  it("Review / Address hide after a successful run until the PR changes again", () => {
    const done = "2026-01-02T10:00:00.000Z";
    const review = (updatedAt: string) =>
      pr(3, {
        ...toReview,
        updatedAt,
        codeReview: { taskId: "t", state: "posted", finishedAt: done },
      });
    const fix = (updatedAt: string) =>
      pr(4, {
        headRef: "feat",
        unresolvedThreads: 2,
        updatedAt,
        addressComments: { taskId: "t", state: "pushed", finishedAt: done },
      });
    // ZIBBY's own write lands just before / around finishedAt → handled.
    expect(hasPrActions(review("2026-01-02T10:00:30.000Z"))).toBe(false);
    expect(hasPrActions(fix("2026-01-02T09:59:59.000Z"))).toBe(false);
    // A colleague's comment / new push later → offered again.
    expect(hasPrActions(review("2026-01-02T11:00:00.000Z"))).toBe(true);
    expect(hasPrActions(fix("2026-01-02T11:00:00.000Z"))).toBe(true);
  });
});

describe("PrActions merge", () => {
  it("ready to merge keeps the hold-to-confirm Squash and merge (deleteBranch on by default)", () => {
    mockFrames(1000);
    renderWithProviders(<PrActions baseLabel="main" pr={pr(5, { section: "ready-to-merge" })} />);
    fireEvent.pointerDown(screen.getByTestId(PrActionsTestId.Merge));
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith(
      { params: { id: "api", number: 5 }, body: { method: "squash", deleteBranch: true } },
      expect.anything(),
    );
  });

  it("unchecking delete-branch sends deleteBranch: false; a single click never merges", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(5, { section: "ready-to-merge" })} />);
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
});

describe("PrActions fix CI", () => {
  const failing = { ci: "failing", headRef: "feat" } as const;

  it("failing CI shows FIX CI, which starts it with the PR target", () => {
    renderWithProviders(<PrActions baseLabel="main" pr={pr(7, failing)} />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.FixCi));
    expect(fixCi).toHaveBeenCalledWith(
      { body: { projectId: "api", repo: "acme/api", number: 7, title: "PR 7" } },
      expect.anything(),
    );
  });

  it("a refused Fix CI shows the server's reason", () => {
    fixCi.mockImplementationOnce((_vars, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.({ status: 422, body: { message: "acme/api#7 comes from a fork" } }),
    );
    renderWithProviders(<PrActions baseLabel="main" pr={pr(7, failing)} />);
    fireEvent.click(screen.getByTestId(PrActionsTestId.FixCi));
    expect(screen.getByTestId(PrActionsTestId.Message)).toHaveTextContent(
      "Oprava CI odmítnuta: acme/api#7 comes from a fork",
    );
  });

  it("a running fix-ci shows its running label linked to the task", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { ...failing, fixCi: { taskId: "t1", state: "running" } })}
      />,
    );
    const running = screen.getByTestId(PrActionsTestId.Running);
    expect(running).toHaveAttribute("href", "/work/tasks/t1");
    expect(running).toHaveTextContent("Agent opravuje CI");
  });

  it("a failed fix-ci keeps the button and links the failed task", () => {
    renderWithProviders(
      <PrActions
        baseLabel="main"
        pr={pr(7, { ...failing, fixCi: { taskId: "t1", state: "failed" } })}
      />,
    );
    expect(screen.getByTestId(PrActionsTestId.FixCi)).toBeInTheDocument();
    expect(screen.getByTestId(PrActionsTestId.Failed)).toHaveAttribute("href", "/work/tasks/t1");
  });
});
