import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
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
        task: { id: "task_1", title: "", text, paths: [], scheduledAt, status: "scheduled", createdAt: new Date(0).toISOString() },
      },
    });
  } else {
    opts?.onSuccess?.({
      status: 201,
      body: { outcome: "dispatched", runRef: "zibby_123_42", target: { kind: "agent", id: "zibby", name: "ZIBBY", glyph: "bot" } },
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
const startGoal = vi.fn((_vars: GoalVars, opts?: GoalOpts) =>
  opts?.onSuccess?.({ status: 201, body: { goalRunId: "goal_run_1" } }),
);
vi.mock("../../goals/mutations", () => ({
  useCreateGoalMutation: () => ({ mutate: createGoal, isPending: false }),
  useStartGoalMutation: () => ({ mutate: startGoal, isPending: false }),
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
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }] }),
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
    startGoal.mockClear();
    createProject.mockClear();
  });

  it("renders one description field, no mode tabs", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    // The Standard/Loop tabs are gone — the mode is inferred, not chosen.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Zadání/)).toBeInTheDocument();
  });

  it("surfaces detected paths as removable context chips", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "Srovnej média v ~/Projects/media-vault");
    const remove = await screen.findByRole("button", { name: "Odebrat cestu ~/Projects/media-vault" });
    await userEvent.click(remove);
    expect(screen.queryByRole("button", { name: /Odebrat cestu/ })).not.toBeInTheDocument();
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
    expect(push).toHaveBeenCalledWith("/runs?run=zibby_123_42");
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

  it("infers a loop and dispatches a goal (createGoal + startGoalRun) on one click", async () => {
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

    expect(startGoal).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/runs?run=goal_run_1");
    expect(onClose).toHaveBeenCalled();
  });

  it("Edit disclosure pre-fills from the proposal and carries an edited maxIterations", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "retry the build until it works");
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    // Open "Edit" → the LoopComposer is pre-filled; bump the iteration cap.
    await userEvent.click(screen.getByRole("button", { name: /Upravit/ }));
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

    await userEvent.click(screen.getByRole("button", { name: /Upravit/ }));
    // The override picker is offered (the candidate list is reachable).
    expect(screen.getByLabelText(/Předat/)).toBeInTheDocument();
  });

  it("defers a scheduled loop through createTask with a goal target (not startGoalRun)", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "keep retrying the deploy until it passes");
    expect(await screen.findByText(/Loop · vykonavatel/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Za 1 h/ }));
    await userEvent.click(screen.getByRole("button", { name: /Naplánovat/ }));

    expect(createGoal).toHaveBeenCalledTimes(1);
    expect(startGoal).not.toHaveBeenCalled();
    const taskBody = createTask.mock.calls.at(-1)?.[0].body;
    expect(taskBody?.target?.kind).toBe("goal");
    expect(taskBody?.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("shows a scoped badge for an in-project path and a grant action for an out-of-project one", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/Zadání/),
      "touch ~/Projects/alpha/x and /tmp/scratch/y",
    );
    // In-project path → "scoped to Alpha"; out-of-project path → "grant access".
    expect(await screen.findByText(/v projektu Alpha/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Povolit ZIBBY přístup k /tmp/scratch/y" }),
    ).toBeInTheDocument();
  });

  it("grants access via an explicit confirm → createProject with the slugified folder", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "work in /tmp/scratch/widget");
    const grant = await screen.findByRole("button", {
      name: "Povolit ZIBBY přístup k /tmp/scratch/widget",
    });
    await userEvent.click(grant);
    // The confirm is the operator's act (Law 1) — nothing registers before it.
    expect(createProject).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Povolit přístup" }));

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0]?.[0].body).toEqual({
      id: "widget",
      name: "widget",
      path: "/tmp/scratch/widget",
    });
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

  it("removing the project's path chip deselects the project (no orphaned path)", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByLabelText(/Projekt/));
    await userEvent.click(await screen.findByRole("option", { name: "Beta" }));

    const remove = await screen.findByRole("button", {
      name: "Odebrat cestu /Users/zibby/Projects/beta",
    });
    await userEvent.click(remove);

    await userEvent.click(screen.getByRole("button", { name: /^Spustit$/ }));
    expect(createTask.mock.calls[0]?.[0].body.paths).not.toContain(
      "/Users/zibby/Projects/beta",
    );
  });

  it("seeds the description from initialText (voice transcript) and infers a loop", async () => {
    render(<NewTaskDialog initialText="keep retrying the deploy until it passes" onClose={() => {}} />);
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
});
