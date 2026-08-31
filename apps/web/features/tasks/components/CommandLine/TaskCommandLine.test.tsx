import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DropDownButtonTestId, DropdownTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen, within } from "../../../../test/render";
import { CommandLineTestId } from "./CommandLine";
import { TaskCommandLine, TaskCommandLineTestId } from "./TaskCommandLine";

/**
 * Phase 118b: TaskCommandLine is the task-launch CONTAINER composed on top of the
 * generic CommandLine. Mocking mirrors CommandLine.test.tsx's own setup — the same
 * catalog/limits/project queries and create-task/create-goal mutations, since the
 * container renders the generic composer internally and feeds the same hooks.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/chat",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "hammer" }] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({
    data: [{ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }],
  }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({ data: [] }),
}));
vi.mock("../../../teams", () => ({
  useTeamsQuery: () => ({ data: [{ id: "devrel", name: "DevRel" }] }),
}));
vi.mock("../../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({
    data: [{ id: "alpha", name: "Alpha", path: "/Users/zibby/Projects/alpha" }],
  }),
  getProjectsQueryKey: () => ["projects"],
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

vi.mock("../../mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

type CreateVars = {
  body: {
    text: string;
    paths?: string[];
    scheduledAt?: number | null;
    target?: { kind: string; id?: string };
    attachmentSetId?: string;
    teamId?: string;
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

describe("TaskCommandLine (Phase 118b task-launch container)", () => {
  beforeEach(() => {
    push.mockClear();
    createTask.mockClear();
    createGoal.mockClear();
    limitsResetAt.value = null;
  });

  it("dispatches a single task via the run control, carrying the composed text", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.text).toBe("zkontroluj zálohy");
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
  });

  it("enables the run control and dispatches to a pre-seeded initialTarget without any typing", async () => {
    const target = { kind: "agent", id: "builder", name: "Builder", glyph: "bot" } as const;
    const user = userEvent.setup();
    render(<TaskCommandLine initialTarget={target} />);

    // Mount with a pre-selected target and NO typing (a common NewTaskDialog entry):
    // the mirror is seeded with the same `@Name ` prefix the generic displays, so the
    // Run control is enabled right away rather than waiting for the first keystroke.
    const run = screen.getByTestId(DropDownButtonTestId.Primary);
    expect(run).toBeEnabled();

    await user.click(run);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.text).toContain("@Builder ");
    expect(createTask.mock.calls[0]?.[0].body.target).toEqual(target);
  });

  it("folds prior-run context into the dispatched text exactly once", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine context="previous run output" />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "pokračuj");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    const dispatched = createTask.mock.calls[0]?.[0].body.text as string;
    expect(dispatched).toContain("pokračuj");
    expect(dispatched).toContain("previous run output");
    expect(dispatched.match(/previous run output/g)).toHaveLength(1);
  });

  it("shows an honest auto-classify ack when showAck is set, reflecting the just-dispatched text", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine showAck />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    const row = screen.getByTestId(TaskCommandLineTestId.AckRow);
    expect(row).toHaveTextContent("auto-klasifikace");
    expect(row).toHaveTextContent("zkontroluj zálohy");
  });

  it("never shows the ack row when showAck is left unset (default false)", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(screen.queryByTestId(TaskCommandLineTestId.AckRow)).not.toBeInTheDocument();
  });

  it("dismisses the ack row via its own dismiss control", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine showAck />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(screen.getByTestId(TaskCommandLineTestId.AckRow)).toBeInTheDocument();

    await user.click(screen.getByTestId(TaskCommandLineTestId.AckDismiss));
    expect(screen.queryByTestId(TaskCommandLineTestId.AckRow)).not.toBeInTheDocument();
  });

  it("schedules 'in 1 hour' from the trailing split-button's menu with a non-null scheduledAt", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-in-1h`));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("schedules 'when limits reset' once a future reset time is known", async () => {
    limitsResetAt.value = RESET_AT;
    const user = userEvent.setup();
    render(<TaskCommandLine />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Trigger));
    await user.click(screen.getByTestId(`${DropDownButtonTestId.Item}-limit-reset`));

    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBe(RESET_AT);
  });

  it("mirrors the live text up via onTextChange, exactly as CommandLine emits it", async () => {
    const onTextChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskCommandLine onTextChange={onTextChange} />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "a");
    expect(onTextChange).toHaveBeenLastCalledWith("a");
  });

  it("does not surface a team as an @-mention source — Task 9b: a tagged team doesn't reach a run yet", async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine />);
    const input = screen.getByTestId(CommandLineTestId.Input);

    await user.type(input, "@DevRel");

    // The teams fixture (mocked above) still resolves "devrel" — proving the row's
    // absence is the task path turning the source off, not an empty catalog.
    expect(
      screen.queryByTestId(`${CommandLineTestId.MentionItem}-team-devrel`),
    ).not.toBeInTheDocument();
    // The picker itself still works for every OTHER source — an agent query still
    // lists a hit, so this isn't a broken picker silently matching nothing.
    await user.clear(input);
    await user.type(input, "@Bui");
    expect(
      screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`),
    ).toBeInTheDocument();
  });

  it("shows the no-teams composer hint — Task 9b: the chrome hint must not claim a mention source this path doesn't offer", () => {
    render(<TaskCommandLine />);
    expect(screen.getByText(/hledá agenty, pipeliny a podsystémy ·/)).toBeInTheDocument();
    expect(screen.queryByText(/a týmy/)).not.toBeInTheDocument();
  });

  it('omits teamId entirely — not "", not null — when no team is picked', async () => {
    const user = userEvent.setup();
    render(<TaskCommandLine />);

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body).not.toHaveProperty("teamId");
  });

  it("mirrors the per-task project pick up via onProjectChange, and folds its path into the dispatched task", async () => {
    const onProjectChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskCommandLine onProjectChange={onProjectChange} />);

    const chip = screen.getByTestId(TaskCommandLineTestId.ProjectSelector);
    await user.click(within(chip).getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    await user.click(options[1] as HTMLElement);

    expect(onProjectChange).toHaveBeenCalledWith("alpha");

    await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));
    expect(createTask.mock.calls[0]?.[0].body.paths).toContain("/Users/zibby/Projects/alpha");
  });

  it("keeps the run control disabled for a loop whose form is still incomplete", () => {
    render(
      <TaskCommandLine
        isLoop
        loop={{
          objective: "",
          maker: "",
          verifierKind: "checks",
          commands: "",
          reviewer: "",
          maxIterations: "5",
          instructions: "",
        }}
      />,
    );

    expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeDisabled();
  });

  it("dispatches via createGoal then createTask once the loop form is complete", async () => {
    const user = userEvent.setup();
    render(
      <TaskCommandLine
        isLoop
        loop={{
          objective: "fix it",
          maker: "pipeline:delivery",
          verifierKind: "checks",
          commands: "",
          reviewer: "",
          maxIterations: "5",
          instructions: "",
        }}
      />,
    );

    await user.type(
      screen.getByTestId(CommandLineTestId.Input),
      "fix the failing test and keep going",
    );
    await user.click(screen.getByTestId(DropDownButtonTestId.Primary));

    expect(createGoal).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.target?.kind).toBe("goal");
  });
});
