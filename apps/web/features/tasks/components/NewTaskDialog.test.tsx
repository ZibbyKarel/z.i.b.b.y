import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DropDownButtonTestId, DropdownTestId, FilePreviewTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen, waitFor, within } from "../../../test/render";
import { CommandLineTestId } from "./CommandLine/CommandLine";
import { TaskCommandLineTestId } from "./CommandLine/TaskCommandLine";
import { NewTaskDialog } from "./NewTaskDialog";
import { ToolGrantsFieldTestId } from "./ToolGrantsField";

/**
 * Phase 11 unified composer, collapsed onto the Phase 26 {@link CommandLine} launcher.
 * The create-task/create-goal/classify mutations and the limits/catalog queries are
 * mocked so the one-field → live-preview → dispatch flow runs without a backend.
 * `classify` echoes a {@link TaskRouting} derived from the typed text (loop-shaped
 * text → `mode: "loop"` carrying a synthesized `proposedGoal`); the dialog renders the
 * preview and branches submit on the inferred mode. Assigning a destination now goes
 * through CommandLine's Phase 45 inline `@` dropdown (no more "Předat" override
 * select, and no separate search box) — exercised here via `CommandLineTestId`
 * the same way `CommandLine.test.tsx` does.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/chat",
  useSearchParams: () => new URLSearchParams(),
}));

const CANDIDATES = [
  { kind: "agent", id: "koder", name: "Kodér" },
  { kind: "pipeline", id: "delivery", name: "Delivery" },
];

function resolvePaths(paths: string[] | undefined) {
  return (paths ?? []).map((path) =>
    /alpha/.test(path)
      ? { path, project: { id: "alpha", name: "Alpha" } }
      : { path, project: null },
  );
}

function apiRouting(
  text: string,
  loop: boolean,
  low: boolean,
  paths?: string[],
  toolGrants: string[] = [],
) {
  if (loop) {
    return {
      target: CANDIDATES[1],
      confidence: 0.85,
      reason: "loop reason",
      matchedTerms: [],
      candidates: CANDIDATES,
      mode: "loop",
      proposedGoal: {
        objective: text,
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 6,
        instructions: text,
      },
      paths: resolvePaths(paths),
      toolGrants,
    };
  }
  return {
    target: CANDIDATES[0],
    confidence: low ? 0.2 : 0.85,
    reason: "single reason",
    matchedTerms: [],
    candidates: CANDIDATES,
    mode: "single",
    proposedGoal: null,
    paths: resolvePaths(paths),
    toolGrants,
  };
}

// A mutable hoisted fixture so a single test can opt into a non-empty tool-grant
// proposal without affecting every other `classify` call in the suite (which all
// expect the tool-grants block to stay hidden — the common case).
const { toolGrantsFixture } = vi.hoisted(() => ({ toolGrantsFixture: [] as string[] }));

const classify = vi.fn(
  (
    vars: { body: { text: string; paths?: string[] } },
    opts?: { onSuccess?: (r: unknown) => void },
  ) => {
    const { text, paths } = vars.body;
    const loop = /until|loop|dokud/i.test(text);
    const low = /vague/i.test(text);
    opts?.onSuccess?.({ status: 200, body: apiRouting(text, loop, low, paths, toolGrantsFixture) });
  },
);

const createProject = vi.fn((_vars: { body: unknown }, opts?: { onSuccess?: () => void }) =>
  opts?.onSuccess?.(),
);
vi.mock("../../projects/mutations", () => ({
  useCreateProjectMutation: () => ({ mutate: createProject, isPending: false }),
}));

type CreateVars = {
  body: {
    text: string;
    paths?: string[];
    scheduledAt?: number | null;
    target?: { kind: string; id?: string };
    output?: { type: string; dest?: string; to?: string };
    attachmentSetId?: string;
    toolGrants?: string[];
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
        task: {
          id: "task_1",
          title: "",
          text,
          paths: [],
          scheduledAt,
          status: "scheduled",
          createdAt: new Date(0).toISOString(),
        },
      },
    });
  } else {
    // The interactive path returns a `pending` task (its run spawns in the
    // background); the dialog redirects to `/archiv` keyed by the task id
    // (F8d — `/runs` is deleted).
    opts?.onSuccess?.({
      status: 201,
      body: {
        outcome: "pending",
        task: {
          id: "task_1",
          title: "",
          text,
          paths: [],
          scheduledAt: 0,
          status: "pending",
          createdAt: new Date(0).toISOString(),
        },
      },
    });
  }
});

vi.mock("../mutations", () => ({
  useClassifyTaskMutation: () => ({ mutate: classify, isPending: false }),
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

const uploadMutateAsync = vi.fn().mockResolvedValue({
  attachmentSetId: "set_1",
  files: [{ name: "a.txt", size: 2 }],
});
vi.mock("../mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));

type GoalVars = { params?: { id: string }; body: Record<string, unknown> };
type GoalOpts = { onSuccess?: (res: { status: 201; body: unknown }) => void };
const createGoal = vi.fn((_vars: GoalVars, opts?: GoalOpts) =>
  opts?.onSuccess?.({ status: 201, body: {} }),
);
vi.mock("../../goals/mutations", () => ({
  useCreateGoalMutation: () => ({ mutate: createGoal, isPending: false }),
}));

vi.mock("../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({
    data: [
      { id: "alpha", name: "Alpha", path: "/Users/zibby/Projects/alpha" },
      { id: "beta", name: "Beta", path: "/Users/zibby/Projects/beta" },
    ],
  }),
  getProjectsQueryKey: () => ["projects"],
}));

vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "koder", name: "Kodér", instructions: "x" }] }),
  // useCreateAgentMutation (pulled in via the agents/mutations barrel) reads this
  // key at module load, so the mock must provide it.
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }] }),
  // useCreate/UpdatePipelineMutation (via the pipelines/mutations barrel) read this
  // key at module load, so the mock must provide it.
  getPipelinesQueryKey: () => ["pipelines"],
}));

const RESET_AT = Date.now() + 3 * 60 * 60 * 1000;
vi.mock("../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: {
      rolling: { usedPct: 10, resetsAt: RESET_AT },
      weekly: { usedPct: 5, resetsAt: null },
      capturedAt: Date.now(),
      stale: false,
    },
  }),
}));

async function pickMention(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  itemId: string,
) {
  const input = screen.getByTestId(CommandLineTestId.Input);
  // A leading space guarantees the `@` starts a fresh word, and the query is typed
  // straight into the SAME field — Phase 45's inline dropdown, never a separate
  // search box.
  await user.type(input, ` @${query}`);
  await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-${itemId}`));
}

describe("NewTaskDialog (Phase 11 unified composer, on the Phase 26 CommandLine)", () => {
  beforeEach(() => {
    push.mockClear();
    classify.mockClear();
    createTask.mockClear();
    createGoal.mockClear();
    createProject.mockClear();
    uploadMutateAsync.mockClear();
    toolGrantsFixture.length = 0;
  });

  it("renders one description field, no mode tabs", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    // The Standard/Loop tabs are gone — the mode is inferred, not chosen.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Zadání/)).toBeInTheDocument();
  });

  it("highlights a referenced path inline in the description", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "Srovnej média v ~/Projects/media-vault");
    // The path is marked inline (on the highlight backdrop), not listed as a chip below.
    const marks = await screen.findAllByTestId("highlight-text-area-mark");
    expect(marks.map((m) => m.textContent).join("")).toContain("~/Projects/media-vault");
  });

  it("folds a referenced path into the dispatched task's allowed directories — no grant step", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "uprav /tmp/scratch/widget a otestuj");
    await screen.findByText(/ZIBBY to předá/);
    // There is no "grant access" action — a referenced path is added automatically.
    expect(screen.queryByRole("button", { name: /Povolit ZIBBY/ })).not.toBeInTheDocument();

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/tmp/scratch/widget");
  });

  it("classifies a one-shot task and dispatches on one click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={onClose} />);
    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    // Live preview appears for the single verdict.
    expect(await screen.findByText(/ZIBBY to předá/)).toBeInTheDocument();
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
    // No output chosen → the field is omitted (inherit), not sent as void.
    expect(createTask.mock.calls[0]?.[0].body.output).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/archiv?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("carries a chosen PR output into the dispatched task", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);

    await user.click(screen.getByLabelText("Výstup úkolu"));
    await user.click(await screen.findByRole("option", { name: "Otevřít PR" }));
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({ type: "pr" });
  });

  it("blocks the run control until an incomplete 'write to a file' output is filled in", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);

    await user.click(screen.getByLabelText("Výstup úkolu"));
    await user.click(await screen.findByRole("option", { name: "Zapsat do souboru" }));
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeDisabled();

    await user.type(screen.getByLabelText("Název souboru"), "report.md");
    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeEnabled();

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({
      type: "file",
      dest: "project",
      to: "report.md",
    });
  });

  it("shows a prior-run context panel and folds it into the dispatched text", async () => {
    const user = userEvent.setup();
    render(
      <NewTaskDialog
        initialContext="Výstup: https://github.com/acme/app/pull/42"
        onClose={() => {}}
      />,
    );
    // The "context added" panel is visible up front.
    expect(screen.getByTestId("task-context-panel")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Zadání/), "navaž na PR");
    await screen.findByText(/ZIBBY to předá/);
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    const sentText = createTask.mock.calls[0]?.[0].body.text as string;
    expect(sentText).toContain("navaž na PR");
    expect(sentText).toContain("https://github.com/acme/app/pull/42");
  });

  it("infers a loop and dispatches it as a task carrying its goal target on one click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={onClose} />);
    await user.type(
      screen.getByLabelText(/Zadání/),
      "fix the failing test and keep going until it's green",
    );
    // The loop preview summarizes maker + checks verifier + iteration cap.
    expect(await screen.findByText(/Loop · vykonavatel Delivery/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Spustit loop/ }));

    expect(createGoal).toHaveBeenCalledTimes(1);
    const goalBody = createGoal.mock.calls[0]?.[0].body as Record<string, unknown>;
    expect(goalBody.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(goalBody.verifier).toEqual({ kind: "checks" });
    expect(goalBody.maxIterations).toBe(6);

    // Only a task runs: the immediate loop enters through createTask with a goal target
    // (scheduledAt null → the scheduler dispatches it now), never a direct goal-run start.
    expect(createTask).toHaveBeenCalledTimes(1);
    const taskBody = createTask.mock.calls[0]?.[0].body;
    expect(taskBody?.target?.kind).toBe("goal");
    expect(taskBody?.scheduledAt).toBeFalsy();
    expect(push).toHaveBeenCalledWith("/archiv?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-fills the loop composer from the proposal and carries an edited maxIterations", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "retry the build until it works");
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    // The LoopComposer renders pre-filled with the proposal; bump the iteration cap.
    const iterations = screen.getByLabelText(/Max\. iterací/);
    await user.clear(iterations);
    await user.type(iterations, "9");

    await user.click(screen.getByRole("button", { name: /Spustit loop/ }));
    const goalBody = createGoal.mock.calls[0]?.[0].body as Record<string, unknown>;
    expect(goalBody.maxIterations).toBe(9);
    // Unedited fields round-trip losslessly from the proposal.
    expect(goalBody.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(goalBody.verifier).toEqual({ kind: "checks" });
  });

  it("shows a low-confidence hint on the preview for a vague single verdict", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "vague request");
    expect(await screen.findByText(/nízká jistota/)).toBeInTheDocument();
  });

  it("lets the operator override a low-confidence verdict by @-mentioning any catalog target, not just the classify candidates", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "vague request");
    expect(await screen.findByText(/nízká jistota/)).toBeInTheDocument();

    await pickMention(user, "Kod", "agent-koder");
    // Phase 59 (item 2): no top chip any more — the picked target is represented by
    // the highlighted inline `@Name` in the input itself.
    expect(screen.getByTestId<HTMLTextAreaElement>(CommandLineTestId.Input).value).toContain(
      "@Kodér",
    );

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.target).toEqual({
      kind: "agent",
      id: "koder",
      name: "Kodér",
      glyph: "bot",
    });
  });

  it("defers a scheduled loop through createTask with a goal target", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "keep retrying the deploy until it passes");
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-in-1h`));

    expect(createGoal).toHaveBeenCalledTimes(1);
    const taskBody = createTask.mock.calls.at(-1)?.[0].body;
    expect(taskBody?.target?.kind).toBe("goal");
    expect(taskBody?.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("has no project field — the project is picked via CommandLine's own inline selector", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.queryByLabelText(/Projekt/)).not.toBeInTheDocument();
  });

  it("folds the picked project's path into the dispatched task, exactly like a typed path", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);

    const chip = screen.getByTestId(TaskCommandLineTestId.ProjectSelector);
    await user.click(within(chip).getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    await user.click(options[2] as HTMLElement); // "Bez projektu", Alpha, Beta

    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");

    // It flows through the live classify (attribution) and into the dispatched task.
    await screen.findByText(/ZIBBY to předá/);
    expect(classify.mock.calls.at(-1)?.[0].body.paths).toContain("/Users/zibby/Projects/beta");

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/Users/zibby/Projects/beta");
  });

  it("folds nothing when no project is picked (default 'Bez projektu')", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).not.toContain("/Users/zibby/Projects/alpha");
    expect(createTask.mock.calls[0]?.[0].body.paths).not.toContain("/Users/zibby/Projects/beta");
  });

  it("seeds the description from initialText (voice transcript) and infers a loop", async () => {
    render(
      <NewTaskDialog initialText="keep retrying the deploy until it passes" onClose={() => {}} />,
    );
    // The one field is pre-filled — Phase 11.4 voice fills it, no spoken form-filling.
    expect(screen.getByLabelText(/Zadání/)).toHaveValue("keep retrying the deploy until it passes");
    // The seeded text classifies on mount → the loop preview appears with no extra input.
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={onClose} />);
    const cancels = screen.getAllByRole("button", { name: /Zrušit/ });
    await user.click(cancels[cancels.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-assigns a pipeline via initialTarget and dispatches straight to it", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={onClose}
      />,
    );
    // It's the standard composer (not a locked mode) with the pipeline pre-assigned: the
    // CommandLine seeds the target as an inline `@Delivery` mention (no top chip — Phase 59).
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    expect(screen.getByTestId<HTMLTextAreaElement>(CommandLineTestId.Input).value).toContain(
      "@Delivery",
    );

    await user.type(screen.getByLabelText(/Zadání/), "spusť delivery pipelinu");
    // Classification still runs (the normal flow, debounced) — it populates the preview.
    await waitFor(() => expect(classify).toHaveBeenCalled());

    // Submitting as-is dispatches straight to the pre-assigned pipeline.
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.target).toEqual({
      kind: "pipeline",
      id: "delivery",
      name: "Delivery",
      glyph: "flow",
    });
    expect(push).toHaveBeenCalledWith("/archiv?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("lets the operator switch the pre-assigned pipeline to another target before dispatch", async () => {
    const user = userEvent.setup();
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={() => {}}
      />,
    );
    await user.type(screen.getByLabelText(/Zadání/), " spusť delivery pipelinu");

    // Clear the pre-assigned pipeline by removing its inline `@Delivery` mention (the
    // top chip is gone — Phase 59), then @-mention the agent instead — the pre-fill is
    // changeable, not a lock. Clearing the text drops the reconciled target.
    await user.clear(screen.getByTestId(CommandLineTestId.Input));
    await pickMention(user, "Kod", "agent-koder");

    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("agent");
    expect(createTask.mock.calls[0]?.[0].body.target?.id).toBe("koder");
  });

  it("carries a chosen output into a pre-assigned pipeline dispatch", async () => {
    const user = userEvent.setup();
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={() => {}}
      />,
    );
    await user.type(screen.getByLabelText(/Zadání/), "spusť delivery pipelinu");

    await user.click(screen.getByLabelText("Výstup úkolu"));
    await user.click(await screen.findByRole("option", { name: "Otevřít PR" }));
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("pipeline");
    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({ type: "pr" });
  });

  it("threads an attached set's attachmentSetId into the dispatched task", async () => {
    const user = userEvent.setup();
    render(<NewTaskDialog onClose={() => {}} />);
    const file = new File(["hi"], "a.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);
    await waitFor(() => expect(screen.getByTestId(FilePreviewTestId.Name)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ attachmentSetId: "set_1" }) }),
      expect.anything(),
    );
  });

  describe("tool-grant checkboxes (Phase 109)", () => {
    it("stays hidden when the classifier proposes nothing (the common case)", async () => {
      const user = userEvent.setup();
      render(<NewTaskDialog onClose={() => {}} />);
      await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
      await screen.findByText(/ZIBBY to předá/);
      expect(screen.queryByTestId(ToolGrantsFieldTestId.Root)).not.toBeInTheDocument();
    });

    it("renders one pre-checked checkbox per proposed grant and threads the confirmed set into the dispatched body", async () => {
      toolGrantsFixture.push("recall_memory", "list_entities");
      const user = userEvent.setup();
      render(<NewTaskDialog onClose={() => {}} />);
      await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
      await screen.findByText(/ZIBBY to předá/);

      const recall = screen.getByTestId(`${ToolGrantsFieldTestId.Item}-recall_memory`);
      const listEntities = screen.getByTestId(`${ToolGrantsFieldTestId.Item}-list_entities`);
      expect(recall).toHaveRole("checkbox");
      expect(recall).toHaveAttribute("aria-checked", "true");
      expect(listEntities).toHaveAttribute("aria-checked", "true");

      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
      expect(createTask.mock.calls[0]?.[0].body.toolGrants).toEqual([
        "recall_memory",
        "list_entities",
      ]);
    });

    it("unchecking one drops it from the submitted toolGrants", async () => {
      toolGrantsFixture.push("recall_memory", "list_entities");
      const user = userEvent.setup();
      render(<NewTaskDialog onClose={() => {}} />);
      await user.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
      await screen.findByText(/ZIBBY to předá/);

      await user.click(screen.getByTestId(`${ToolGrantsFieldTestId.Item}-recall_memory`));
      await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

      expect(createTask.mock.calls[0]?.[0].body.toolGrants).toEqual(["list_entities"]);
    });
  });
});
