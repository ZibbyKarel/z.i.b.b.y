import type { InboxPrThread } from "@zibby/contracts";
import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { PrThreads, PrThreadsTestId } from "./PrThreads";
import { ReviewThreadTestId } from "./ReviewThread/ReviewThread";

const hooks = vi.hoisted(() => ({
  threads: [] as InboxPrThread[],
  isError: false,
  replyError: false,
  variables: undefined as unknown,
  mutate: vi.fn(),
}));
vi.mock("../queries", () => ({
  useInboxPrThreadsQuery: () => ({ data: hooks.threads, isError: hooks.isError }),
}));
vi.mock("../mutations", () => ({
  useReplyInboxPrThreadMutation: () => ({
    mutate: hooks.mutate,
    isPending: false,
    isError: hooks.replyError,
    variables: hooks.variables,
  }),
}));

const NOW = Date.parse("2026-10-22T12:00:00Z");

function thread(id: string, isResolved: boolean): InboxPrThread {
  return {
    id,
    isResolved,
    isOutdated: false,
    path: `src/${id}.ts`,
    line: 1,
    startLine: null,
    diffHunk: "@@ -1 +1 @@\n+x",
    comments: [{ id: `${id}-c`, author: null, createdAt: "2026-10-22T11:58:00Z", body: "hi" }],
  };
}

const ui = <PrThreads now={NOW} number={7} projectId="api" />;

describe("PrThreads", () => {
  beforeEach(() => {
    hooks.threads = [];
    hooks.isError = false;
    hooks.replyError = false;
    hooks.variables = undefined;
    hooks.mutate.mockReset();
  });

  it("hides when there are no threads", () => {
    renderWithProviders(ui);
    expect(screen.queryByTestId(PrThreadsTestId.Root)).toBeNull();
  });

  it("shows a small error line when the query fails", () => {
    hooks.isError = true;
    renderWithProviders(ui);
    expect(screen.getByTestId(PrThreadsTestId.Error)).toBeInTheDocument();
  });

  it("lists unresolved threads and hides resolved until toggled", () => {
    hooks.threads = [thread("PRRT_a", false), thread("PRRT_b", true)];
    renderWithProviders(ui);
    expect(screen.getByTestId(PrThreadsTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(PrThreadsTestId.Summary)).toHaveTextContent(
      "1 nevyřešené · 1 vyřešených",
    );
    expect(screen.getAllByTestId(ReviewThreadTestId.Root)).toHaveLength(1);
    fireEvent.click(screen.getByTestId(PrThreadsTestId.ShowResolved));
    expect(screen.getAllByTestId(ReviewThreadTestId.Root)).toHaveLength(2);
    expect(screen.getAllByTestId(ReviewThreadTestId.ReplyInput)).toHaveLength(1);
  });

  it("send posts the reply with resolve", () => {
    hooks.threads = [thread("PRRT_a", false)];
    renderWithProviders(ui);
    fireEvent.change(screen.getByTestId(ReviewThreadTestId.ReplyInput), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Resolve));
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Send));
    expect(hooks.mutate).toHaveBeenCalledWith(
      {
        params: { projectId: "api", number: 7, threadId: "PRRT_a" },
        body: { body: "done", resolve: true },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("blank body with resolve sends only resolve", () => {
    hooks.threads = [thread("PRRT_a", false)];
    renderWithProviders(ui);
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Resolve));
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Send));
    expect(hooks.mutate.mock.calls[0]?.[0].body).toEqual({ resolve: true });
  });

  it("clears the draft after onSuccess", () => {
    hooks.threads = [thread("PRRT_a", false)];
    renderWithProviders(ui);
    const input = screen.getByTestId(ReviewThreadTestId.ReplyInput);
    fireEvent.change(input, { target: { value: "done" } });
    fireEvent.click(screen.getByTestId(ReviewThreadTestId.Send));
    expect(input).toHaveValue("done");
    act(() => hooks.mutate.mock.calls[0]?.[1].onSuccess());
    expect(screen.getByTestId(ReviewThreadTestId.ReplyInput)).toHaveValue("");
  });

  it("keeps the draft and shows an error when the reply fails", () => {
    hooks.threads = [thread("PRRT_a", false)];
    hooks.replyError = true;
    hooks.variables = { params: { threadId: "PRRT_a" } };
    renderWithProviders(ui);
    expect(screen.getByTestId(PrThreadsTestId.ReplyError)).toBeInTheDocument();
  });

  it("summary is expanded by default only with open threads", () => {
    hooks.threads = [thread("PRRT_a", false)];
    const first = renderWithProviders(ui);
    expect(screen.getByTestId(PrThreadsTestId.Summary).closest("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    first.unmount();
    hooks.threads = [thread("PRRT_b", true)];
    renderWithProviders(ui);
    expect(screen.getByTestId(PrThreadsTestId.Summary).closest("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
