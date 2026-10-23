import { fireEvent, renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../run";
import type { RunMode } from "../runDetailModel";
import { RunComposer, RunComposerTestId } from "./RunComposer";

const m = vi.hoisted(() => ({
  send: vi.fn(),
  answer: vi.fn(),
  openNewTask: vi.fn(),
}));
vi.mock("../../approvals", () => ({
  useAnswerApprovalMutation: () => ({ mutate: m.answer, isPending: false }),
}));
vi.mock("../mutations", () => ({
  useSendTaskRunMessageMutation: () => ({ mutate: m.send, isPending: false }),
}));
vi.mock("../../tasks", () => ({
  useNewTask: () => ({ open: m.openNewTask, close: vi.fn(), isOpen: false }),
}));
vi.mock("./RunOutputView", () => ({ useContinueTaskContext: () => "CTX" }));

const workflowRun: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
};

const approval = {
  id: "ap_1",
  runId: "delivery_42.p2_1",
  action: "stage-approval",
  skill: "coder",
} as DashboardApproval;

const crew = [
  { key: "p1", name: "planner" },
  { key: "p2", name: "coder" },
];

let resume: ReturnType<typeof vi.fn>;
let onSent: ReturnType<typeof vi.fn>;

function renderComposer(mode: RunMode, over: Partial<RunView> = {}) {
  render(
    <RunComposer
      approval={approval}
      crew={crew}
      mode={mode}
      onSent={onSent}
      resume={resume}
      resuming={false}
      run={{ ...workflowRun, ...over }}
    />,
  );
}

async function typeAndSend(text: string) {
  await userEvent.type(screen.getByTestId(RunComposerTestId.Input), text);
  await userEvent.click(screen.getByTestId(RunComposerTestId.Send));
}

beforeEach(() => {
  vi.clearAllMocks();
  resume = vi.fn();
  onSent = vi.fn();
});

describe("RunComposer", () => {
  it.each<RunMode>(["running", "pausing", "paused", "approval"])(
    "workflow %s queues a message to ALL by default",
    async (mode) => {
      renderComposer(mode);
      await typeAndSend("use the new API");
      expect(m.send).toHaveBeenCalledWith(
        { params: { runId: "delivery_42" }, body: { text: "use the new API", to: "all" } },
        expect.anything(),
      );
    },
  );

  it("the selected chip changes the recipient", async () => {
    renderComposer("running");
    await userEvent.click(screen.getByTestId(`${RunComposerTestId.Recipient}-p2`));
    await typeAndSend("hi");
    expect(m.send).toHaveBeenCalledWith(
      { params: { runId: "delivery_42" }, body: { text: "hi", to: "p2" } },
      expect.anything(),
    );
  });

  it("paused shows the paused hint", () => {
    renderComposer("paused");
    expect(screen.getByTestId(RunComposerTestId.Hint)).toHaveTextContent(
      "Běh je pozastaven · zprávy čekají",
    );
  });

  it.each<RunMode>(["running", "pausing", "approval"])(
    "an agent %s run disables the input and send",
    (mode) => {
      renderComposer(mode, { kind: "agent" });
      expect(screen.getByTestId(RunComposerTestId.Input)).toBeDisabled();
      expect(screen.getByTestId(RunComposerTestId.Send)).toBeDisabled();
      expect(screen.queryByTestId(`${RunComposerTestId.Recipient}-all`)).not.toBeInTheDocument();
    },
  );

  it("question answers the approval", async () => {
    renderComposer("question", { status: "awaiting-approval" });
    expect(screen.getByTestId(RunComposerTestId.Send)).toHaveTextContent("Odpovědět ↵");
    await typeAndSend("yes, use v2");
    expect(m.answer).toHaveBeenCalledWith(
      { params: { id: "ap_1" }, body: { answer: "yes, use v2" } },
      expect.anything(),
    );
  });

  it.each<RunMode>(["parked", "stopped", "error"])("%s resumes with the note", async (mode) => {
    renderComposer(mode);
    await typeAndSend("try the other branch");
    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "delivery_42" }),
      expect.objectContaining({ mode: "continue", note: "try the other branch" }),
    );
  });

  it("done opens a follow-up task with the output as context", async () => {
    renderComposer("done", { status: "done" });
    await typeAndSend("now add docs");
    expect(m.openNewTask).toHaveBeenCalledWith("now add docs", undefined, "CTX");
    expect(onSent).toHaveBeenCalledOnce();
  });

  it.each<RunMode>(["waiting", "limit"])("%s has a disabled input and no send", (mode) => {
    renderComposer(mode);
    expect(screen.getByTestId(RunComposerTestId.Input)).toBeDisabled();
    expect(screen.queryByTestId(RunComposerTestId.Send)).not.toBeInTheDocument();
  });

  it("two quick Enters while the send is in flight fire mutate once", async () => {
    renderComposer("running");
    const input = screen.getByTestId(RunComposerTestId.Input);
    await userEvent.type(input, "once");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(m.send).toHaveBeenCalledOnce();
  });

  it("empty text never sends, and the input clears only on success", async () => {
    renderComposer("running");
    const input = screen.getByTestId(RunComposerTestId.Input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(m.send).not.toHaveBeenCalled();
    await userEvent.type(input, "keep me");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("keep me");
    const opts = m.send.mock.calls[0]?.[1] as { onSuccess: () => void; onSettled: () => void };
    opts.onSuccess();
    opts.onSettled();
    expect(await screen.findByDisplayValue("")).toBe(input);
    expect(onSent).toHaveBeenCalledOnce();
  });
});
