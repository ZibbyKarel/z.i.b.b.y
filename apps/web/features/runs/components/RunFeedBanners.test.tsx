import { fireEvent, renderWithProviders as render, screen, within } from "../../../test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DiffstatListTestId } from "@zibby/design-system";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../run";
import {
  RunApprovalBanner,
  RunFeedBannersTestId,
  RunParkedBanner,
  RunQuestionBanner,
} from "./RunFeedBanners";

const { approveMutate, rejectMutate, reviseMutate } = vi.hoisted(() => ({
  reviseMutate: vi.fn(),
  approveMutate: vi.fn(),
  rejectMutate: vi.fn(),
}));
vi.mock("../../approvals", () => ({
  useApproveMutation: () => ({ mutate: approveMutate, isPending: false }),
  useRejectMutation: () => ({ mutate: rejectMutate, isPending: false }),
  useReviseMutation: () => ({ mutate: reviseMutate, isPending: false }),
}));

const approval: DashboardApproval = {
  id: "ap-1",
  runId: "delivery_42.coder",
  kind: "workflow-stage",
  skill: "coder",
  action: "stage-approval",
  detail: "Review the produced file",
  text: "Review the produced file",
  risk: "medium",
  status: "pending",
  requestedAt: "2026-10-20T10:00:00Z",
};

/** The HoldButton's rAF loop, driven synchronously past the hold duration (DS test pattern). */
function mockFrames(frameTime: number) {
  let now = 0;
  let first = true;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    if (first) {
      first = false;
      now = frameTime;
      cb(now);
    }
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
}

function renderApproval(
  over: Partial<DashboardApproval> = {},
  diffstat?: RunView["diffstat"],
  reviseOpen = false,
) {
  render(
    <RunApprovalBanner
      approval={{ ...approval, ...over }}
      diffstat={diffstat}
      onToggleRevise={vi.fn()}
      reviseOpen={reviseOpen}
    />,
  );
}

describe("RunApprovalBanner", () => {
  beforeEach(() => {
    approveMutate.mockClear();
    rejectMutate.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("a stage approval offers REVISE", () => {
    renderApproval();
    expect(screen.getByTestId(RunFeedBannersTestId.Revise)).toBeInTheDocument();
  });

  it("an open revise shows the note field; sending calls revise with the note", async () => {
    renderApproval({}, undefined, true);
    const send = screen.getByTestId(RunFeedBannersTestId.ReviseSend);
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByTestId(RunFeedBannersTestId.ReviseNote), " tighten tests ");
    await userEvent.click(send);
    expect(reviseMutate).toHaveBeenCalledWith(
      { params: { id: "ap-1" }, body: { note: "tighten tests" } },
      expect.anything(),
    );
  });

  it("a closed revise shows no note field", () => {
    renderApproval();
    expect(screen.queryByTestId(RunFeedBannersTestId.ReviseNote)).not.toBeInTheDocument();
  });

  it("a git.push approval does not", () => {
    renderApproval({ action: "git.push" });
    expect(screen.queryByTestId(RunFeedBannersTestId.Revise)).not.toBeInTheDocument();
  });

  it("holding approve fires the approve mutation", () => {
    mockFrames(5000);
    renderApproval();
    fireEvent.pointerDown(screen.getByTestId(RunFeedBannersTestId.Hold));
    expect(approveMutate).toHaveBeenCalledOnce();
    expect(approveMutate.mock.calls[0]?.[0]).toEqual({ params: { id: "ap-1" }, body: {} });
  });

  it("reject confirms, then fires the reject mutation with the approval id", async () => {
    renderApproval();
    await userEvent.click(screen.getByTestId(RunFeedBannersTestId.Reject));
    expect(rejectMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Zamítnout" }));
    expect(rejectMutate).toHaveBeenCalledWith({ params: { id: "ap-1" }, body: {} });
  });

  it("a diffstat renders one row per file", () => {
    renderApproval(
      {},
      {
        additions: 12,
        deletions: 3,
        files: [
          { path: "src/a.ts", additions: 10, deletions: 1 },
          { path: "src/b.ts", additions: 2, deletions: 2 },
        ],
      },
    );
    const diff = screen.getByTestId(RunFeedBannersTestId.Diff);
    expect(within(diff).getAllByTestId(new RegExp(`^${DiffstatListTestId.Row}-`))).toHaveLength(2);
  });
});

describe("RunQuestionBanner", () => {
  it("renders the question as text, never HTML", () => {
    render(<RunQuestionBanner agentName="coder" question="Use <b>bold</b> here?" />);
    const banner = screen.getByTestId(RunFeedBannersTestId.Question);
    expect(banner).toHaveTextContent("Use <b>bold</b> here?");
    expect(banner.querySelector("b")).toBeNull();
  });
});

describe("RunParkedBanner", () => {
  it("names the stage and attempts", () => {
    const run = {
      runId: "delivery_42",
      kind: "workflow",
      owner: "delivery",
      status: "parked",
      pct: null,
      title: "",
      prompt: "",
      project: "",
      startedAt: "2026-10-20T10:00:00Z",
      logBase: null,
      parked: { phaseId: "coder", attempts: 3, failureFile: "/x" },
    } satisfies RunView;
    render(<RunParkedBanner run={run} />);
    expect(screen.getByTestId(RunFeedBannersTestId.Parked)).toHaveTextContent("03/03");
  });
});
