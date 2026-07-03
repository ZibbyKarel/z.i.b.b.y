import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, waitFor } from "../../../test/render";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * Phase 11 unified composer. The create-task + classify mutations and the limits
 * query are mocked so the one-field → live-preview → dispatch flow runs without a
 * backend. `classify` echoes a {@link TaskRouting} derived from the typed text
 * (loop-shaped text → `mode: "loop"` carrying a synthesized `proposedGoal`); the
 * dialog renders the preview and branches submit on the inferred mode.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
}));

// Task 12: stub the real TaskAttachments composite (Task 11 already tests it in
// isolation) so this suite only proves the threading — NewTaskDialog actually
// mounts it, and a chosen set's attachmentSetId reaches the create body.
vi.mock("./TaskAttachments", () => ({
  TaskAttachments: ({
    onChange,
  }: {
    onChange: (v: { attachmentSetId?: string; files: unknown[] }) => void;
  }) => (
    <button
      data-testid="attach-stub"
      onClick={() => onChange({ attachmentSetId: "set_1", files: [{ name: "a.txt", size: 2 }] })}
      type="button"
    >
      attach
    </button>
  ),
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

function apiRouting(text: string, loop: boolean, low: boolean, paths?: string[]) {
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
  };
}

const classify = vi.fn(
  (
    vars: { body: { text: string; paths?: string[] } },
    opts?: { onSuccess?: (r: unknown) => void },
  ) => {
    const { text, paths } = vars.body;
    const loop = /until|loop|dokud/i.test(text);
    const low = /vague/i.test(text);
    opts?.onSuccess?.({ status: 200, body: apiRouting(text, loop, low, paths) });
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
    // background); the dialog redirects to `/runs` keyed by the task id.
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

describe("NewTaskDialog (Phase 11 unified composer)", () => {
  beforeEach(() => {
    push.mockClear();
    classify.mockClear();
    createTask.mockClear();
    createGoal.mockClear();
    createProject.mockClear();
  });

  it("renders one description field, no mode tabs", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    // The Standard/Loop tabs are gone — the mode is inferred, not chosen.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Zadání/)).toBeInTheDocument();
  });

  it("highlights a referenced path inline in the description", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "Srovnej média v ~/Projects/media-vault");
    // The path is marked inline (on the highlight backdrop), not listed as a chip below.
    const marks = await screen.findAllByTestId("highlight-text-area-mark");
    expect(marks.map((m) => m.textContent).join("")).toContain("~/Projects/media-vault");
  });

  it("folds a referenced path into the dispatched task's allowed directories — no grant step", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "uprav /tmp/scratch/widget a otestuj");
    await screen.findByText(/ZIBBY to předá/);
    // There is no "grant access" action — a referenced path is added automatically.
    expect(screen.queryByRole("button", { name: /Povolit ZIBBY/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/tmp/scratch/widget");
  });

  it("classifies a one-shot task and dispatches on one click", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    // Live preview appears for the single verdict.
    expect(await screen.findByText(/ZIBBY to předá/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
    // No output chosen → the field is omitted (inherit), not sent as void.
    expect(createTask.mock.calls[0]?.[0].body.output).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/runs?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("carries a chosen PR output into the dispatched task", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);

    await userEvent.click(screen.getByLabelText("Výstup úkolu"));
    await userEvent.click(await screen.findByRole("option", { name: "Otevřít PR" }));
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({ type: "pr" });
  });

  it("shows a prior-run context panel and folds it into the dispatched text", async () => {
    render(
      <NewTaskDialog
        initialContext="Výstup: https://github.com/acme/app/pull/42"
        onClose={() => {}}
      />,
    );
    // The "context added" panel is visible up front.
    expect(screen.getByTestId("task-context-panel")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Zadání/), "navaž na PR");
    await screen.findByText(/ZIBBY to předá/);
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    const sentText = createTask.mock.calls[0]?.[0].body.text as string;
    expect(sentText).toContain("navaž na PR");
    expect(sentText).toContain("https://github.com/acme/app/pull/42");
  });

  it("carries a chosen file output (dest + filename) into the dispatched task", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);

    await userEvent.click(screen.getByLabelText("Výstup úkolu"));
    await userEvent.click(await screen.findByRole("option", { name: "Zapsat do souboru" }));
    // The filename is required — submit stays blocked until it's filled.
    await userEvent.type(screen.getByLabelText("Název souboru"), "report.md");
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({
      type: "file",
      dest: "project",
      to: "report.md",
    });
  });

  it("infers a loop and dispatches it as a task carrying its goal target on one click", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.type(
      screen.getByLabelText(/Zadání/),
      "fix the failing test and keep going until it's green",
    );
    // The loop preview summarizes maker + checks verifier + iteration cap.
    expect(await screen.findByText(/Loop · vykonavatel Delivery/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Spustit loop/ }));

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
    expect(push).toHaveBeenCalledWith("/runs?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-fills the loop composer from the proposal and carries an edited maxIterations", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "retry the build until it works");
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    // The LoopComposer renders pre-filled with the proposal; bump the iteration cap.
    const iterations = screen.getByLabelText(/Max\. iterací/);
    await userEvent.clear(iterations);
    await userEvent.type(iterations, "9");

    await userEvent.click(screen.getByRole("button", { name: /Spustit loop/ }));
    const goalBody = createGoal.mock.calls[0]?.[0].body as Record<string, unknown>;
    expect(goalBody.maxIterations).toBe(9);
    // Unedited fields round-trip losslessly from the proposal.
    expect(goalBody.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(goalBody.verifier).toEqual({ kind: "checks" });
  });

  it("offers a manual target picker for a low-confidence single verdict", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "vague request");
    expect(await screen.findByText(/nízká jistota/)).toBeInTheDocument();

    // The override picker is offered directly (the candidate list is reachable).
    expect(screen.getByLabelText(/Předat/)).toBeInTheDocument();
  });

  it("defers a scheduled loop through createTask with a goal target", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/Zadání/),
      "keep retrying the deploy until it passes",
    );
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Za 1 h/ }));
    await userEvent.click(screen.getByRole("button", { name: /Naplánovat/ }));

    expect(createGoal).toHaveBeenCalledTimes(1);
    const taskBody = createTask.mock.calls.at(-1)?.[0].body;
    expect(taskBody?.target?.kind).toBe("goal");
    expect(taskBody?.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("folds a selected project's path into the dispatched task, exactly like a typed path", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");

    // Pick a project — its configured `path` is added to context like a typed path.
    await userEvent.click(screen.getByLabelText(/Projekt/));
    await userEvent.click(await screen.findByRole("option", { name: "Beta" }));

    // It flows through the live classify (attribution) and into the dispatched task.
    await screen.findByText(/ZIBBY to předá/);
    expect(classify.mock.calls.at(-1)?.[0].body.paths).toContain("/Users/zibby/Projects/beta");

    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/Users/zibby/Projects/beta");
  });

  it("deselecting the project drops its path from the dispatched task", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByLabelText(/Projekt/));
    await userEvent.click(await screen.findByRole("option", { name: "Beta" }));

    // Switch the picker back to "no project" — its path is no longer folded in.
    await userEvent.click(screen.getByLabelText(/Projekt/));
    await userEvent.click(await screen.findByRole("option", { name: /Žádný projekt/ }));

    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
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
    render(<NewTaskDialog onClose={onClose} />);
    const cancels = screen.getAllByRole("button", { name: /Zrušit/ });
    await userEvent.click(cancels[cancels.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-selects a pipeline in the standard composer and dispatches straight to it", async () => {
    const onClose = vi.fn();
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={onClose}
      />,
    );
    // It's the standard composer (not a locked mode) with the pipeline pre-chosen: the
    // "Edit" target picker is open and already shows the pipeline as the selected value.
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Předat/)).toHaveTextContent("Delivery");

    await userEvent.type(screen.getByLabelText(/Zadání/), "spusť delivery pipelinu");
    // Classification still runs (the normal flow, debounced) — it populates the alternatives.
    await waitFor(() => expect(classify).toHaveBeenCalled());

    // Submitting as-is dispatches straight to the pre-selected pipeline.
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.target).toEqual({
      kind: "pipeline",
      id: "delivery",
      name: "Delivery",
      glyph: "flow",
    });
    expect(push).toHaveBeenCalledWith("/runs?run=task_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("lets the operator switch the pre-selected pipeline to another target before dispatch", async () => {
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Zadání/), "spusť delivery pipelinu");

    // Switch the target picker from the pre-selected pipeline to the agent candidate
    // (a classify alternative) — the pre-fill is changeable, not a lock.
    await userEvent.click(screen.getByLabelText(/Předat/));
    await userEvent.click(await screen.findByRole("option", { name: "Kodér" }));

    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
    expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("agent");
    expect(createTask.mock.calls[0]?.[0].body.target?.id).toBe("koder");
  });

  it("carries a chosen output into a pre-selected pipeline dispatch", async () => {
    render(
      <NewTaskDialog
        initialTarget={{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }}
        onClose={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Zadání/), "spusť delivery pipelinu");

    await userEvent.click(screen.getByLabelText("Výstup úkolu"));
    await userEvent.click(await screen.findByRole("option", { name: "Otevřít PR" }));
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("pipeline");
    expect(createTask.mock.calls[0]?.[0].body.output).toEqual({ type: "pr" });
  });

  it("threads an attached set's attachmentSetId into the dispatched task", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    // Proves TaskAttachments is actually mounted — if NewTaskDialog forgot to
    // render it, this stub button wouldn't exist.
    await userEvent.click(screen.getByTestId("attach-stub"));

    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await screen.findByText(/ZIBBY to předá/);
    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ attachmentSetId: "set_1" }) }),
      expect.anything(),
    );
  });
});
