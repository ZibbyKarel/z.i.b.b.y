import type { InboxPrThread } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../i18n/messages/cs.json";
import { renderWithProviders, screen } from "../../../../test/render";
import { ReviewThread, ReviewThreadTestId } from "./ReviewThread";

const NOW = Date.parse("2026-10-22T12:00:00Z");

const thread: InboxPrThread = {
  id: "PRRT_abc",
  isResolved: false,
  isOutdated: false,
  path: "src/a.ts",
  line: 12,
  startLine: null,
  diffHunk: "@@ -1,6 +1,6 @@\n l1\n l2\n l3\n l4\n+l5",
  comments: [
    {
      id: "c1",
      author: { login: "alice", avatarUrl: "" },
      createdAt: "2026-10-22T11:56:00Z",
      body: "Please **rename** this <script>x</script>",
    },
    { id: "c2", author: null, createdAt: "2026-10-22T11:58:00Z", body: "second" },
  ],
};

describe("ReviewThread", () => {
  it("renders file, snippet and every comment", () => {
    renderWithProviders(<ReviewThread now={NOW} thread={thread} />);
    expect(screen.getByTestId(ReviewThreadTestId.File)).toHaveTextContent("src/a.ts:12");
    const snippet = screen.getByTestId(ReviewThreadTestId.Snippet);
    expect(snippet).not.toHaveTextContent("@@");
    expect(snippet).not.toHaveTextContent("l1");
    expect(snippet).toHaveTextContent("l5");
    const comments = screen.getAllByTestId(ReviewThreadTestId.Comment);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toHaveTextContent("alice");
    expect(comments[0]).toHaveTextContent("<script>x</script>");
    expect(comments[0]?.querySelector("script")).toBeNull();
  });

  it("shows the question outcome tag", () => {
    renderWithProviders(
      <ReviewThread
        isNew
        now={NOW}
        outcome={{ threadId: "PRRT_abc", kind: "question", note: "why?" }}
        thread={thread}
      />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.OutcomeTag)).toHaveTextContent(
      messages.inboxPage.threads.outcome.question,
    );
    expect(screen.getByTestId(ReviewThreadTestId.NewTag)).toBeInTheDocument();
  });

  it("renders an outdated thread with a short hunk", () => {
    renderWithProviders(
      <ReviewThread
        now={NOW}
        thread={{ ...thread, isOutdated: true, line: null, diffHunk: "@@ -1 +1 @@\n a\n+b" }}
      />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.OutdatedTag)).toBeInTheDocument();
    expect(screen.getByTestId(ReviewThreadTestId.File)).toHaveTextContent(/^src\/a\.ts$/);
    expect(screen.getByTestId(ReviewThreadTestId.Snippet)).toHaveTextContent("b");
  });

  it("reply input reports edits via onChange", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ReviewThread now={NOW} reply={{ body: "", resolve: false, onChange }} thread={thread} />,
    );
    fireEvent.change(screen.getByTestId(ReviewThreadTestId.ReplyInput), {
      target: { value: "ok" },
    });
    expect(onChange).toHaveBeenCalledWith({ body: "ok", resolve: false });
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Resolve));
    expect(onChange).toHaveBeenCalledWith({ body: "", resolve: true });
  });

  it("read-only without reply prop", () => {
    renderWithProviders(<ReviewThread now={NOW} thread={thread} />);
    expect(screen.queryByTestId(ReviewThreadTestId.ReplyInput)).toBeNull();
  });

  it("Send is disabled for an empty body without resolve", () => {
    const base = { onChange: vi.fn(), onSend: vi.fn() };
    const { unmount } = renderWithProviders(
      <ReviewThread now={NOW} reply={{ ...base, body: "  ", resolve: false }} thread={thread} />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.Send)).toBeDisabled();
    unmount();
    renderWithProviders(
      <ReviewThread now={NOW} reply={{ ...base, body: "", resolve: true }} thread={thread} />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.Send)).toBeEnabled();
  });

  it("clicking the resolve label text toggles resolve", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ReviewThread now={NOW} reply={{ body: "x", resolve: false, onChange }} thread={thread} />,
    );
    fireEvent.click(screen.getByText(messages.inboxPage.threads.resolve));
    expect(onChange).toHaveBeenCalledWith({ body: "x", resolve: true });
  });

  it("Send is disabled while sending and click calls onSend", () => {
    const onSend = vi.fn();
    const base = { onChange: vi.fn(), onSend, body: "hi", resolve: false };
    const { unmount } = renderWithProviders(
      <ReviewThread now={NOW} reply={{ ...base, sending: true }} thread={thread} />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.Send)).toBeDisabled();
    unmount();
    renderWithProviders(<ReviewThread now={NOW} reply={base} thread={thread} />);
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Send));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("ignores a trailing blank line in the hunk", () => {
    renderWithProviders(
      <ReviewThread now={NOW} thread={{ ...thread, diffHunk: `${thread.diffHunk}\n\n` }} />,
    );
    expect(screen.getByTestId(ReviewThreadTestId.Snippet)).toHaveTextContent("l2");
    expect(screen.getByTestId(ReviewThreadTestId.Snippet)).not.toHaveTextContent("l1");
  });
});
