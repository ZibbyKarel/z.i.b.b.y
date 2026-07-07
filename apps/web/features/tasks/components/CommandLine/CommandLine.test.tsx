import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChipTestId,
  DropDownButtonTestId,
  FilePreviewTestId,
  SearchMenuTestId,
} from "@zibby/design-system";
import { renderWithProviders as render, screen, waitFor } from "../../../../test/render";
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

  describe("@ mention picker", () => {
    it("opens on '@', filters the catalog, and assigns the picked target as a chip", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onTargetChange={onTargetChange} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");
      const mentionInput = screen.getByTestId(SearchMenuTestId.Input);
      await user.type(mentionInput, "Bui");
      expect(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`)).toBeInTheDocument();
      expect(screen.queryByTestId(`${SearchMenuTestId.Item}-pipelines-delivery`)).not.toBeInTheDocument();

      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`));

      expect(screen.getByTestId(CommandLineTestId.TargetChip)).toHaveTextContent("Builder");
      expect(input).toHaveValue("@Builder ");
      expect(onTargetChange).toHaveBeenLastCalledWith({
        kind: "agent",
        id: "builder",
        name: "Builder",
        glyph: "hammer",
      });
    });

    it("dispatches straight to the mentioned target — reaching the whole catalog, not just classify candidates", async () => {
      const user = userEvent.setup();
      render(<CommandLine />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");
      await user.type(screen.getByTestId(SearchMenuTestId.Input), "Deliv");
      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-pipelines-delivery`));
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
      await user.type(input, "@");
      await user.type(screen.getByTestId(SearchMenuTestId.Input), "Bui");
      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`));

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
});
