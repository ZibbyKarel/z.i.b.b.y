import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChipTestId,
  DropDownButtonTestId,
  FilePreviewTestId,
  HighlightTextAreaFieldTestId,
  PanelTestId,
  SearchMenuTestId,
} from "@zibby/design-system";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../../test/render";
import { CommandLine, CommandLineTestId } from "./CommandLine";

/**
 * Phase 26: the unified task launcher. The catalog/limits/project queries and the
 * create-task/create-goal mutations are mocked so the type → assign → attach → run
 * flow runs without a backend — the same mocking pattern NewTaskDialog.test.tsx
 * already established.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({
    data: [
      { id: "builder", name: "Builder", glyph: "hammer" },
      { id: "koder", name: "Kodér" },
    ],
  }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({
    data: [{ id: "alpha", name: "Alpha", path: "/Users/zibby/Projects/alpha" }],
  }),
  getProjectsQueryKey: () => ["projects"],
}));
const { activeProject } = vi.hoisted(() => ({ activeProject: { id: null as string | null } }));
vi.mock("../../../projects/context/ProjectProvider", () => ({
  useActiveProject: () => ({ activeProjectId: activeProject.id, setActiveProject: vi.fn() }),
}));

const RESET_AT = Date.now() + 3 * 60 * 60 * 1000;
const { limitsResetAt } = vi.hoisted(() => ({ limitsResetAt: { value: null as number | null } }));
vi.mock("../../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: {
      rolling: { usedPct: 10, resetsAt: limitsResetAt.value },
      weekly: { usedPct: 5, resetsAt: null },
      capturedAt: Date.now(),
      stale: false,
    },
  }),
}));

const uploadMutateAsync = vi.fn().mockResolvedValue({
  attachmentSetId: "set_1",
  files: [{ name: "a.txt", size: 2 }],
});
vi.mock("../../mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));

type CreateVars = {
  body: {
    text: string;
    paths?: string[];
    scheduledAt?: number | null;
    target?: { kind: string; id?: string };
    attachmentSetId?: string;
  };
};
type CreateOpts = { onSuccess?: (res: { status: 201; body: unknown }) => void };
const createTask = vi.fn((vars: CreateVars, opts?: CreateOpts) => {
  const { scheduledAt, text } = vars.body;
  if (scheduledAt) {
    opts?.onSuccess?.({
      status: 201,
      body: {
        outcome: "scheduled",
        task: { id: "task_1", title: "", text, paths: [], scheduledAt, status: "scheduled",
          createdAt: new Date(0).toISOString() },
      },
    });
  } else {
    opts?.onSuccess?.({
      status: 201,
      body: {
        outcome: "pending",
        task: { id: "task_1", title: "", text, paths: [], scheduledAt: 0, status: "pending",
          createdAt: new Date(0).toISOString() },
      },
    });
  }
});
vi.mock("../../mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

type GoalVars = { params?: { id: string }; body: Record<string, unknown> };
type GoalOpts = { onSuccess?: (res: { status: 201; body: unknown }) => void };
const createGoal = vi.fn((_vars: GoalVars, opts?: GoalOpts) =>
  opts?.onSuccess?.({ status: 201, body: {} }),
);
vi.mock("../../../goals/mutations", () => ({
  useCreateGoalMutation: () => ({ mutate: createGoal, isPending: false }),
}));

describe("CommandLine (Phase 26 unified launcher)", () => {
  beforeEach(() => {
    push.mockClear();
    createTask.mockClear();
    createGoal.mockClear();
    uploadMutateAsync.mockClear();
    activeProject.id = null;
    limitsResetAt.value = null;
  });

  it("dispatches on Enter and clears via the parent's onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandLine onClose={onClose} />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.keyboard("{Enter}");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
    expect(push).toHaveBeenCalledWith("/runs?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("inserts a newline on Shift+Enter instead of running", async () => {
    const user = userEvent.setup();
    render(<CommandLine />);

    const input = screen.getByTestId(CommandLineTestId.Input);
    await user.type(input, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(input, "line two");

    expect(createTask).not.toHaveBeenCalled();
    expect(input).toHaveValue("line one\nline two");
  });

  it("does not run on an empty/too-short description", async () => {
    const user = userEvent.setup();
    render(<CommandLine />);
    await user.click(screen.getByTestId(CommandLineTestId.Input));
    await user.keyboard("{Enter}");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("folds a referenced path into the dispatched task's allowed directories", async () => {
    const user = userEvent.setup();
    render(<CommandLine />);
    await user.type(
      screen.getByTestId(CommandLineTestId.Input),
      "uprav /tmp/scratch/widget a otestuj",
    );
    const marks = await screen.findAllByTestId("highlight-text-area-mark");
    expect(marks.map((m) => m.textContent).join("")).toContain("/tmp/scratch/widget");

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/tmp/scratch/widget");
  });

  it("folds the active project's path into the dispatched task", async () => {
    activeProject.id = "alpha";
    const user = userEvent.setup();
    render(<CommandLine />);
    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/Users/zibby/Projects/alpha");
  });

  describe("@ mention picker — Phase 45: a caret-anchored INLINE dropdown, never a separate search box", () => {
    it("opens inline on '@', filters live as the query is typed in the SAME field, and assigns the picked target as a chip", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onTargetChange={onTargetChange} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");

      // The dropdown is anchored under the SAME field — never an external
      // SearchMenu with its own input stealing focus.
      expect(screen.getByTestId(CommandLineTestId.MentionMenu)).toBeInTheDocument();
      expect(screen.queryByTestId(SearchMenuTestId.Root)).not.toBeInTheDocument();
      expect(input).toHaveFocus();

      expect(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`)).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-pipeline-delivery`),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));

      expect(screen.getByTestId(CommandLineTestId.TargetChip)).toHaveTextContent("Builder");
      expect(input).toHaveValue("@Builder ");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
      expect(onTargetChange).toHaveBeenLastCalledWith({
        kind: "agent",
        id: "builder",
        name: "Builder",
        glyph: "hammer",
      });
    });

    it("navigates with ArrowDown and picks with Enter — the textarea itself carries the keyboard nav", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");
      expect(input).toHaveFocus();

      // Results order: Builder, Kodér, Delivery — ArrowDown once lands on Kodér.
      await user.keyboard("{ArrowDown}{Enter}");

      expect(input).toHaveFocus();
      expect(input).toHaveValue("@Kodér ");
      expect(screen.getByTestId(CommandLineTestId.TargetChip)).toHaveTextContent("Kodér");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("closes on Escape without submitting or touching the typed text, and leaves the ordinary send-on-Enter path intact", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      expect(screen.getByTestId(CommandLineTestId.MentionMenu)).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
      expect(input).toHaveValue("@Bui");
      expect(createTask).not.toHaveBeenCalled();

      // No mention open any more — Enter now takes the ordinary submit path.
      await user.keyboard("{Enter}");
      expect(createTask).toHaveBeenCalledTimes(1);
    });

    it("dispatches straight to the mentioned target — reaching the whole catalog, not just classify candidates", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Deliv");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-pipeline-delivery`));
      await user.type(input, "spusť to");

      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
      expect(createTask.mock.calls[0]?.[0].body.target).toEqual({
        kind: "pipeline",
        id: "delivery",
        name: "Delivery",
        glyph: "flow",
      });
    });

    it("removing the chip clears the target", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));

      await user.click(screen.getByTestId(ChipTestId.Close));
      expect(screen.queryByTestId(CommandLineTestId.TargetChip)).not.toBeInTheDocument();
      expect(onTargetChange).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe("attachments", () => {
    it("uploads a file picked via the + button and shows it as a FilePreview chip", async () => {
      const onAttachmentsChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onAttachmentsChange={onAttachmentsChange} />);

      const file = new File(["hi"], "a.txt", { type: "text/plain" });
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);

      await waitFor(() => {
        expect(screen.getByTestId(FilePreviewTestId.Name)).toHaveTextContent("a.txt");
      });
      expect(onAttachmentsChange).toHaveBeenCalledWith({
        attachmentSetId: "set_1",
        files: [{ name: "a.txt", size: 2 }],
      });
    });

    it("threads the attached set's attachmentSetId into the dispatched task", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      const file = new File(["hi"], "a.txt", { type: "text/plain" });
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);
      await waitFor(() => expect(screen.getByTestId(FilePreviewTestId.Name)).toBeInTheDocument());

      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ attachmentSetId: "set_1" }) }),
        expect.anything(),
      );
    });
  });

  describe("scheduling", () => {
    it("runs immediately via the primary action", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
      expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
    });

    it("schedules 'in 1 hour' from the trailing menu", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
      await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-in-1h`));

      expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeGreaterThan(Date.now());
    });

    it("does not offer 'when limits reset' while no future reset time is known", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
      expect(screen.queryByTestId(`${DropDownButtonTestId.Item}-limit-reset`)).not.toBeInTheDocument();
    });

    it("schedules 'when limits reset' once a future reset time is known", async () => {
      limitsResetAt.value = RESET_AT;
      const user = userEvent.setup();
      render(<CommandLine />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
      await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-limit-reset`));
      expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBe(RESET_AT);
    });
  });

  describe("loop mode (an embedding parent's classify says the text synthesizes a loop)", () => {
    const LOOP = {
      objective: "fix it",
      maker: "pipeline:delivery",
      verifierKind: "checks" as const,
      commands: "",
      reviewer: "",
      maxIterations: "5",
      instructions: "",
    };

    it("labels the run control 'Run loop' and dispatches via createGoal then createTask", async () => {
      const user = userEvent.setup();
      render(<CommandLine isLoop loop={LOOP} />);
      await user.type(
        screen.getByTestId(CommandLineTestId.Input),
        "fix the failing test and keep going",
      );
      await user.click(screen.getByRole("button", { name: /Spustit loop/ }));

      expect(createGoal).toHaveBeenCalledTimes(1);
      expect(createTask).toHaveBeenCalledTimes(1);
      expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("goal");
    });
  });

  it("blocks the run control while `disabled` is set (e.g. an incomplete output choice)", async () => {
    const user = userEvent.setup();
    render(<CommandLine disabled />);
    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeDisabled();
  });

  describe("Phase 31a — velin-b chrome, drag overlay, mention tones, suggestions, ack", () => {
    it("wraps the input in the panel chrome by default (header icon + label + hint)", () => {
      render(<CommandLine />);
      expect(screen.getByTestId(PanelTestId.Header)).toHaveTextContent("Zadej směr");
      expect(screen.getByText(/hledá agenty a pipeliny/)).toBeInTheDocument();
    });

    it("renders a bare input with no panel chrome when chrome={false}", () => {
      render(<CommandLine chrome={false} />);
      expect(screen.queryByTestId(PanelTestId.Header)).not.toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Input)).toBeInTheDocument();
    });

    it("shows the dashed drop overlay while dragging over the box, and hides it on drag-leave", () => {
      render(<CommandLine />);
      const box = screen.getByTestId(CommandLineTestId.Box);
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();

      fireEvent.dragOver(box);
      expect(screen.getByTestId(CommandLineTestId.DropOverlay)).toBeInTheDocument();

      fireEvent.dragLeave(box);
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
    });

    it("hides the drop overlay again once a drop lands", () => {
      render(<CommandLine />);
      const box = screen.getByTestId(CommandLineTestId.Box);
      fireEvent.dragOver(box);
      expect(screen.getByTestId(CommandLineTestId.DropOverlay)).toBeInTheDocument();

      fireEvent.drop(box, { dataTransfer: { files: [] } });
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
    });

    it("tints @mentions by resolved type — a known agent accent, a known pipeline push, an unresolved token dim", () => {
      render(<CommandLine />);
      // A single `change` (rather than typing character-by-character) — typing a
      // literal `@` triggers the mention picker, which steals focus to its own
      // search input; this test only cares what the final text renders as, not the
      // picker's own UX (already covered by the "@ mention picker" describe above).
      fireEvent.change(screen.getByTestId(CommandLineTestId.Input), {
        target: { value: "@Builder a @Delivery a @report.md" },
      });

      const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
      const byText = (needle: string) => marks.find((m) => m.textContent === needle);

      expect(byText("@Builder")).toHaveClass("bg-accent/[0.14]");
      expect(byText("@Delivery")).toHaveClass("bg-risk-push/[0.14]");
      expect(byText("@report.md")).toHaveClass("bg-foreground-dim/[0.14]");
    });

    it("shows suggestion chips only while the input is empty, and clicking one dispatches it immediately", async () => {
      const user = userEvent.setup();
      render(<CommandLine suggestions={["zkontroluj zálohy", "shrň standup"]} />);

      const chips = screen.getAllByTestId(CommandLineTestId.Suggestion);
      expect(chips.length).toBeGreaterThan(0);
      expect(chips.map((c) => c.textContent)).toEqual(["zkontroluj zálohy", "shrň standup"]);

      await user.click(chips[0] as HTMLElement);

      expect(createTask).toHaveBeenCalledTimes(1);
      expect(createTask.mock.calls[0]?.[0].body.text).toBe("zkontroluj zálohy");
      // The field cleared to the dispatched suggestion — no longer empty — so the
      // chip rail is gone (superseded by the ack row once the operator enables it).
      expect(screen.queryByTestId(CommandLineTestId.Suggestion)).not.toBeInTheDocument();
    });

    it("does not show the ack row by default, even after a successful dispatch", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.keyboard("{Enter}");
      expect(screen.queryByTestId(CommandLineTestId.AckRow)).not.toBeInTheDocument();
    });

    it("shows an honest auto-classify ack when no target is assigned and showAck is set", async () => {
      const user = userEvent.setup();
      render(<CommandLine showAck />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.keyboard("{Enter}");

      const row = screen.getByTestId(CommandLineTestId.AckRow);
      expect(row).toHaveTextContent("auto-klasifikace");
      expect(row).toHaveTextContent("zkontroluj zálohy");
    });

    it("reflects the actually-picked mention target's kind/name in the ack — never a fabricated route", async () => {
      const user = userEvent.setup();
      render(<CommandLine showAck />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "otestuj to");

      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

      const row = screen.getByTestId(CommandLineTestId.AckRow);
      expect(row).toHaveTextContent("agent");
      expect(row).toHaveTextContent("Builder");
    });

    it("dismisses the ack row via its close control", async () => {
      const user = userEvent.setup();
      render(<CommandLine showAck />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.keyboard("{Enter}");
      expect(screen.getByTestId(CommandLineTestId.AckRow)).toBeInTheDocument();

      await user.click(screen.getByTestId(CommandLineTestId.AckDismiss));
      expect(screen.queryByTestId(CommandLineTestId.AckRow)).not.toBeInTheDocument();
    });
  });

  describe("Phase 38 — send-delegation mode (the chat composer)", () => {
    it("calls onSubmit — not the task-launch mutation — on Enter, carrying the picked target, and clears the field", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "ahoj");
      await user.keyboard("{Enter}");

      expect(onSubmit).toHaveBeenCalledWith(
        "@Builder ahoj",
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        undefined,
      );
      expect(createTask).not.toHaveBeenCalled();
      expect(input).toHaveValue("");
      expect(screen.queryByTestId(CommandLineTestId.TargetChip)).not.toBeInTheDocument();
    });

    it("renders a plain Send action instead of the run split-button, and Send dispatches via onSubmit", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);

      expect(screen.queryByTestId(DropDownButtonTestId.Primary)).not.toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Send)).toBeInTheDocument();

      await user.type(screen.getByTestId(CommandLineTestId.Input), "ahoj");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith("ahoj", undefined, undefined);
      expect(createTask).not.toHaveBeenCalled();
    });

    it("disables the input and the Send action while `disabled` is set (e.g. while ZIBBY is thinking)", () => {
      render(<CommandLine disabled initialText="ahoj" onSubmit={vi.fn()} />);
      expect(screen.getByTestId(CommandLineTestId.Input)).toBeDisabled();
      expect(screen.getByTestId(CommandLineTestId.Send)).toBeDisabled();
    });

    it("applies an externally injected target (the chat quick-switcher palette) into the text and chip, then reports it consumed", () => {
      const onInjectedTargetConsumed = vi.fn();
      const target = { kind: "agent", id: "builder", name: "Builder", glyph: "bot" } as const;
      const { rerender } = render(
        <CommandLine onInjectedTargetConsumed={onInjectedTargetConsumed} onSubmit={vi.fn()} />,
      );
      rerender(
        <CommandLine
          injectedTarget={target}
          onInjectedTargetConsumed={onInjectedTargetConsumed}
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByTestId(CommandLineTestId.TargetChip)).toHaveTextContent("Builder");
      expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue("@Builder ");
      expect(onInjectedTargetConsumed).toHaveBeenCalledTimes(1);
    });

    it("fires onDraftChange true/false as the draft flips between empty and non-empty", async () => {
      const onDraftChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onDraftChange={onDraftChange} onSubmit={vi.fn()} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "h");
      expect(onDraftChange).toHaveBeenLastCalledWith(true);

      await user.keyboard("{Enter}");
      expect(onDraftChange).toHaveBeenLastCalledWith(false);
    });

    describe("showAttach={false} (chat: the message API has no attachment channel)", () => {
      it("hides the attach/pin buttons and the hidden file input", () => {
        render(<CommandLine onSubmit={vi.fn()} showAttach={false} />);
        expect(screen.queryByTestId(CommandLineTestId.Attach)).not.toBeInTheDocument();
        expect(screen.queryByTestId(CommandLineTestId.Pin)).not.toBeInTheDocument();
        expect(screen.queryByTestId(CommandLineTestId.FileInput)).not.toBeInTheDocument();
      });

      it("ignores drag-and-drop — no overlay ever shows", () => {
        render(<CommandLine onSubmit={vi.fn()} showAttach={false} />);
        fireEvent.dragOver(screen.getByTestId(CommandLineTestId.Box));
        expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
      });
    });
  });
});
