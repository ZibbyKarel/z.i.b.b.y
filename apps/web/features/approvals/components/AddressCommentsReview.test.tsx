import type { InboxPrThread, ScheduledTask } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ReviewThreadTestId } from "../../inbox/components/ReviewThread/ReviewThread";
import {
  AddressCommentsReview,
  AddressCommentsReviewTestId,
  addressApproveReplies,
  approveRequestBody,
  mergeReviewThreads,
} from "./AddressCommentsReview";

const NOW = Date.parse("2026-10-22T12:00:00Z");

function mk(id: string, isResolved = false): InboxPrThread {
  return {
    id,
    isResolved,
    isOutdated: false,
    path: `src/${id}.ts`,
    line: 1,
    startLine: null,
    diffHunk: "@@ -1 +1 @@\n+x",
    comments: [{ id: `c-${id}`, author: null, createdAt: "2026-10-22T11:58:00Z", body: "hi" }],
  };
}

const A = mk("PRRT_a");
const B = mk("PRRT_b", true);
const C = mk("PRRT_c");
const D = mk("PRRT_d");
const outcomes = [
  { threadId: "PRRT_c", kind: "done" as const, note: "abc" },
  { threadId: "PRRT_b", kind: "skipped" as const, note: "n" },
  { threadId: "PRRT_a", kind: "question" as const, note: "?" },
];

describe("mergeReviewThreads", () => {
  it("orders by report, appends new open threads, nulls resolved drafts", () => {
    const rows = mergeReviewThreads([A, B, C, D, mk("PRRT_e", true)], outcomes, [
      { threadId: "PRRT_c", body: "fixed", resolve: true },
    ]);
    expect(rows.map((r) => r.thread.id)).toEqual(["PRRT_c", "PRRT_b", "PRRT_a", "PRRT_d"]);
    expect(rows.map((r) => r.isNew)).toEqual([false, false, false, true]);
    expect(rows[0]?.draft).toEqual({ body: "fixed", resolve: true });
    expect(rows[1]?.draft).toBeNull();
    expect(rows[2]?.draft).toEqual({ body: "", resolve: false });
    expect(rows[3]?.draft).toEqual({ body: "", resolve: false });
  });
});

const hooks = vi.hoisted(() => ({ threads: { data: undefined as unknown, isError: false } }));
vi.mock("../../inbox/queries", () => ({ useInboxPrThreadsQuery: () => hooks.threads }));

const task = {
  projectId: "p1",
  prAddressComments: { number: 7, outcomes, report: "# Report" },
} as unknown as ScheduledTask;

describe("AddressCommentsReview", () => {
  beforeEach(() => {
    hooks.threads = { data: [A, B, C], isError: false };
  });

  it("renders a ReviewThread per shown thread with the draft pre-filled", () => {
    renderWithProviders(
      <AddressCommentsReview
        now={NOW}
        onRepliesChange={vi.fn()}
        replies={[
          { threadId: "PRRT_c", body: "fixed it", resolve: true },
          { threadId: "PRRT_a", body: "", resolve: false },
        ]}
        task={task}
      />,
    );
    expect(screen.getByTestId(AddressCommentsReviewTestId.Summary)).toBeInTheDocument();
    expect(screen.getAllByTestId(ReviewThreadTestId.Root)).toHaveLength(3);
    expect(screen.getAllByTestId(ReviewThreadTestId.ReplyInput)).toHaveLength(2);
    expect(screen.getAllByTestId(ReviewThreadTestId.ReplyInput)[0]).toHaveValue("fixed it");
    expect(screen.getByTestId(AddressCommentsReviewTestId.AlreadyResolved)).toBeInTheDocument();
    expect(screen.getByTestId(AddressCommentsReviewTestId.Report)).toBeInTheDocument();
  });

  it("editing a draft calls onRepliesChange", () => {
    const onRepliesChange = vi.fn();
    renderWithProviders(
      <AddressCommentsReview
        now={NOW}
        onRepliesChange={onRepliesChange}
        replies={[
          { threadId: "PRRT_c", body: "fixed it", resolve: true },
          { threadId: "PRRT_a", body: "", resolve: false },
        ]}
        task={task}
      />,
    );
    fireEvent.change(screen.getAllByTestId(ReviewThreadTestId.ReplyInput)[1] as HTMLElement, {
      target: { value: "answer" },
    });
    expect(onRepliesChange).toHaveBeenCalledWith([
      { threadId: "PRRT_c", body: "fixed it", resolve: true },
      { threadId: "PRRT_a", body: "answer", resolve: false },
    ]);
  });
});

describe("approve payload", () => {
  const address = {
    number: 7,
    outcomes,
    replies: [
      { threadId: "PRRT_c", body: "fixed", resolve: true },
      { threadId: "PRRT_a", body: "draft a" },
    ],
  } as unknown as NonNullable<ScheduledTask["prAddressComments"]>;

  it("threads loaded: every open thread incl. empty bodies, resolved excluded, exact shape", () => {
    const replies = addressApproveReplies(address, [A, B, C, D], {});
    expect(replies).toEqual([
      { threadId: "PRRT_c", body: "fixed", resolve: true },
      { threadId: "PRRT_a", body: "draft a", resolve: false },
      { threadId: "PRRT_d", body: "", resolve: false },
    ]);
    for (const r of replies) expect(Object.keys(r).sort()).toEqual(["body", "resolve", "threadId"]);
  });

  it("only the edited thread overrides the baseline", () => {
    const replies = addressApproveReplies(address, [A, C], {
      PRRT_a: { threadId: "PRRT_a", body: "mine", resolve: true },
    });
    expect(replies.map((r) => r.body)).toEqual(["fixed", "mine"]);
  });

  it("threads loading or errored: falls back to the task drafts", () => {
    expect(addressApproveReplies(address, undefined, {})).toEqual([
      { threadId: "PRRT_c", body: "fixed", resolve: false }, // resolve never goes out unseen
      { threadId: "PRRT_a", body: "draft a", resolve: false },
    ]);
  });

  it("a non-address kind sends no replies key", () => {
    expect(approveRequestBody(undefined, "APPROVE")).toEqual({ reviewEvent: "APPROVE" });
    expect(approveRequestBody(undefined, undefined)).toEqual({});
    expect("replies" in approveRequestBody(undefined, undefined)).toBe(false);
  });
});

describe("AddressCommentsReview fallback", () => {
  it("shows non-empty fallback drafts read-only when the threads failed", () => {
    hooks.threads = { data: undefined, isError: true };
    renderWithProviders(
      <AddressCommentsReview
        now={NOW}
        onRepliesChange={vi.fn()}
        replies={[
          { threadId: "PRRT_c", body: "will be sent", resolve: true },
          { threadId: "PRRT_a", body: "", resolve: false },
        ]}
        task={task}
      />,
    );
    const drafts = screen.getAllByTestId(AddressCommentsReviewTestId.FallbackDraft);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toHaveTextContent("will be sent");
    expect(screen.queryByTestId(ReviewThreadTestId.ReplyInput)).toBeNull();
  });
});
