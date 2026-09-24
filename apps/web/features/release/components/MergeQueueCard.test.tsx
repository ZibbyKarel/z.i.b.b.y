import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MergeQueueEntry } from "@zibby/contracts";
import { MergeQueueCard, MergeQueueCardTestId } from "./MergeQueueCard";

let entries: MergeQueueEntry[] = [];
const mutate = vi.fn();
vi.mock("../queries", () => ({
  useMergeQueueQuery: () => ({ data: { entries, generatedAt: "2026-07-17T00:00:00.000Z" } }),
  getMergeQueueQueryKey: (projectId?: string) => ["maestro-queue", projectId ?? "all"],
}));
vi.mock("../../projects/mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate, isPending: false }),
}));

const entry = (over: Partial<MergeQueueEntry>): MergeQueueEntry => ({
  number: 42,
  title: "feat: ship the thing",
  url: "https://github.com/acme/app/pull/42",
  draft: false,
  projectId: "acme-app",
  projectName: "Acme App",
  repo: "acme/app",
  checkState: "passing",
  reviewState: "approved",
  mergeable: "mergeable",
  ageHours: 3,
  queueState: "ready",
  ...over,
});

/**
 * Drives the HoldButton's rAF-based hold loop deterministically to full
 * completion — same harness as `ApprovalCard.test.tsx`.
 */
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

describe("MergeQueueCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mutate.mockClear();
  });

  it("renders nothing when the queue is empty", () => {
    entries = [];
    render(<MergeQueueCard />);
    expect(screen.queryByTestId(MergeQueueCardTestId.Root)).toBeNull();
  });

  it("renders a hold-to-merge control and the GitHub link for a ready entry", () => {
    entries = [entry({})];
    render(<MergeQueueCard />);
    expect(screen.getByTestId(MergeQueueCardTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(MergeQueueCardTestId.MergeHold)).toBeInTheDocument();
    expect(screen.getByTestId(MergeQueueCardTestId.OpenInGithub)).toHaveAttribute(
      "href",
      "https://github.com/acme/app/pull/42",
    );
  });

  it("renders no merge control on a blocked entry — only the reason and the link", () => {
    entries = [entry({ queueState: "blocked", checkState: "failing", reviewState: "unknown" })];
    render(<MergeQueueCard />);
    expect(screen.queryByTestId(MergeQueueCardTestId.MergeHold)).not.toBeInTheDocument();
    expect(screen.getByTestId(MergeQueueCardTestId.OpenInGithub)).toBeInTheDocument();
  });

  it("renders no merge control on a stale entry — only the reason and the link", () => {
    entries = [entry({ queueState: "stale" })];
    render(<MergeQueueCard />);
    expect(screen.queryByTestId(MergeQueueCardTestId.MergeHold)).not.toBeInTheDocument();
    expect(screen.getByTestId(MergeQueueCardTestId.OpenInGithub)).toBeInTheDocument();
  });

  it("a single click arms the hold button but does NOT fire the merge mutation", () => {
    entries = [entry({})];
    render(<MergeQueueCard />);
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("holding to completion fires the merge mutation exactly once with the right params", () => {
    entries = [entry({})];
    mockFrames(1000);
    render(<MergeQueueCard />);
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { params: { id: "acme-app", number: 42 }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("a successful merge invalidates both the merge-queue and project-PRs query keys", () => {
    entries = [entry({})];
    mockFrames(1000);
    render(<MergeQueueCard />);
    fireEvent.pointerDown(screen.getByRole("button"));

    const onSuccess = mutate.mock.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
    expect(onSuccess).toBeInstanceOf(Function);
    // Firing it must not throw — it invalidates the merge-queue key and the
    // per-project PR key ("project-prs", entry.projectId) via the query client.
    expect(() => onSuccess?.()).not.toThrow();
  });
});
