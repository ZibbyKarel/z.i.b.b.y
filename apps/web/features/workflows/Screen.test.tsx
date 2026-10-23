import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent, UpdateWorkflowInput } from "@zibby/contracts";
import { DialogTestId, EntityHeroTestId } from "@zibby/design-system";
import type { Workflow } from "../../domain";
import { WorkflowCardTestId } from "./components/WorkflowCard/WorkflowCard";
import { Screen, ScreenTestId } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AGENTS: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

const WORKFLOW: Workflow = {
  id: "build-feature",
  name: "Build Feature",
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "f",
  outputs: [],
  phases: [],
};

// A workflow with an existing chain (agent → verify with a rework loop back to
// the agent) — mirrors the fixture the old `WorkflowDialog.test.tsx` edit-mode
// suite used, now exercised through the inline detail-view editor instead.
const EXISTING: Workflow = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "build → verify",
  file: "f",
  outputs: [],
  phases: [
    {
      id: "koder",
      type: "agent",
      agent: "writer",
      consumes: "task.md",
      produces: "implementation.md",
      model: "sonnet",
      thinking: "medium",
    },
    {
      id: "verify",
      type: "agent",
      agent: "writer",
      consumes: "implementation.md",
      produces: "verdict.md",
      model: "sonnet",
      thinking: "medium",
      loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" },
    },
  ],
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    workflows: {
      data: [] as Workflow[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useWorkflowsQuery: () => hooks.workflows,
  useWorkflowRunsQuery: () => ({ data: [] }),
  useWorkflowRunQuery: () => ({ data: undefined }),
}));
vi.mock("./mutations", () => ({
  useCreateWorkflowMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateWorkflowMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDuplicateWorkflowMutation: () => ({ mutate: vi.fn(), isPending: false }),
  duplicateWorkflowBody: vi.fn(),
}));
vi.mock("../agents", () => ({ useAgentsQuery: () => ({ data: AGENTS }) }));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: vi.fn() }) }));
vi.mock("../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({
    get: (id: string) => (id === "delivery" ? { name: "Delivery", color: "#fff" } : undefined),
  }),
}));

describe("workflows Screen — no images", () => {
  it("renders no hero image in the detail dialog", () => {
    hooks.workflows = { data: [WORKFLOW], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    expect(screen.queryByTestId(EntityHeroTestId.Root)).toBeNull();
  });
});

const OWNED: Workflow = { ...WORKFLOW, id: "ship", name: "Ship", department: "delivery" };

describe("workflows Screen — categorized grid + detail dialog", () => {
  const withList = () => {
    hooks.workflows = {
      data: [WORKFLOW, OWNED],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    push.mockReset();
  };

  it("list route: one section per department plus an unowned group, cards inside", () => {
    withList();
    render(<Screen />);
    const groups = screen.getAllByTestId(ScreenTestId.Group);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Delivery");
    expect(groups[0]).toHaveTextContent("Ship");
    expect(groups[1]).toHaveTextContent("Bez oddělení");
    expect(groups[1]).toHaveTextContent("Build Feature");
    expect(screen.getAllByTestId(WorkflowCardTestId.Root)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Přidat workflow" })).toBeInTheDocument();
  });

  it("clicking a card navigates to its detail route", async () => {
    withList();
    render(<Screen />);
    await userEvent.click(screen.getAllByTestId(WorkflowCardTestId.Root)[0]!);
    expect(push).toHaveBeenCalledWith("/work/workflows/ship");
  });

  it("without selectedId there is no dialog", () => {
    withList();
    render(<Screen />);
    expect(screen.queryByTestId(DialogTestId.Root)).toBeNull();
  });

  it("with selectedId the dialog shows the workflow's detail over the grid", () => {
    withList();
    render(<Screen selectedId="build-feature" />);
    const dialog = screen.getByTestId(DialogTestId.Root);
    expect(screen.getByTestId(DialogTestId.Title)).toHaveTextContent("Build Feature");
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByTestId(ScreenTestId.Group)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Workflow" })).toBeInTheDocument();
  });

  it("closing the dialog navigates back to the list route", async () => {
    withList();
    render(<Screen selectedId="build-feature" />);
    await userEvent.click(screen.getByTestId(DialogTestId.CloseButton));
    expect(push).toHaveBeenCalledWith("/work/workflows");
  });

  it("department tab basePath: close returns to that basePath", async () => {
    withList();
    render(<Screen basePath="/workforce/departments/delivery/workflows" selectedId="ship" />);
    await userEvent.click(screen.getByTestId(DialogTestId.CloseButton));
    expect(push).toHaveBeenCalledWith("/workforce/departments/delivery/workflows");
  });

  it("unknown selectedId: no dialog, grid still renders", () => {
    withList();
    render(<Screen selectedId="nope" />);
    expect(screen.queryByTestId(DialogTestId.Root)).toBeNull();
    expect(screen.getAllByTestId(WorkflowCardTestId.Root)).toHaveLength(2);
  });
});

describe("workflows Screen — inline edit", () => {
  it("toggles the detail canvas editable in place, pre-filling one node per phase", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="delivery" />);

    // Read mode: the canvas is static.
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));

    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zrušit" })).toBeInTheDocument();
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);
  });

  it("the agents palette is hidden until '+' is clicked, and auto-closes after adding an agent", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    hooks.update.mockReset();
    render(<Screen selectedId="delivery" />);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.queryByTestId("palette-agent-writer")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    expect(screen.getByTestId("palette-agent-writer")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("palette-agent-writer"));

    // Auto-closed after the add, and the new node landed on the canvas.
    expect(screen.queryByTestId("palette-agent-writer")).toBeNull();
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(3);
  });

  it("Save PATCHes only the changed phases", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    hooks.update.mockReset();
    hooks.update.mockImplementation((_args: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<Screen selectedId="delivery" />);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    await userEvent.click(screen.getByTestId("palette-agent-tester"));
    await userEvent.click(screen.getByRole("button", { name: "Uložit" }));

    expect(hooks.update).toHaveBeenCalledTimes(1);
    const [{ params, body }] = hooks.update.mock.calls[0] as [
      { params: { id: string }; body: UpdateWorkflowInput },
    ];
    expect(params).toEqual({ id: "delivery" });
    expect(Object.keys(body)).toEqual(["phases"]);
    expect(body.phases).toHaveLength(3);

    // Back to read mode (the mocked mutation doesn't update the underlying
    // query data, so the detail canvas reverting to its prior 2-node graph
    // here is a test-double artifact, not something we assert on).
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editovat" })).toBeInTheDocument();
  });

  it("closing the dialog mid-edit exits edit mode (reopening shows read mode)", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    const { rerender } = render(<Screen selectedId="delivery" />);
    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();

    rerender(<Screen />);
    expect(screen.queryByTestId(DialogTestId.Root)).toBeNull();

    rerender(<Screen selectedId="delivery" />);
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editovat" })).toBeInTheDocument();
  });

  it("Cancel discards the in-progress graph edit", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    hooks.update.mockReset();
    render(<Screen selectedId="delivery" />);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    await userEvent.click(screen.getByTestId("palette-agent-tester"));
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(hooks.update).not.toHaveBeenCalled();

    // Back to read mode with the original (unchanged) graph.
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);

    // Re-entering edit re-seeds from the (unchanged) workflow, not the discarded draft.
    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);
  });
});
