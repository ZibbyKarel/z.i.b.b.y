import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent, UpdateWorkflowInput } from "@zibby/contracts";
import { BreadcrumbTestId, EntityHeroTestId } from "@zibby/design-system";
import type { Workflow } from "../../domain";
import { Screen } from "./Screen";

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
  avatar: "data:image/png;base64,AAA",
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
      type: "verify",
      commands: ["pnpm test"],
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

describe("workflows Screen — avatar hero", () => {
  it("renders the selected workflow's avatar in the detail hero", () => {
    hooks.workflows = { data: [WORKFLOW], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    const image = screen.getByTestId(EntityHeroTestId.Image);
    expect(image).toHaveAttribute("src", WORKFLOW.avatar);
  });
});

// F5 (docs/plans/hud2chat-F5-orchestration.md): one Screen serves both
// `/workflows` (list) and `/workflows/[id]` (detail) — `routeId` (the
// `selectedId` prop, absent on the list route) must drive the page header's
// title/subtitle/actions and, above all, the breadcrumb — the single most
// likely defect: it must never loop the detail route's back link back to
// itself, and the list route (a top-level nav destination) must show none.
describe("workflows Screen — page header (F5)", () => {
  it("list route: title is the section name, no breadcrumb, actions offer Add", () => {
    hooks.workflows = { data: [WORKFLOW], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.getByRole("heading", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.queryByTestId(BreadcrumbTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Přidat workflow" })).toBeInTheDocument();
  });

  it("detail route: title is the workflow's name, breadcrumb back goes to /work/workflows, no Add action", () => {
    hooks.workflows = { data: [WORKFLOW], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    expect(screen.getByRole("heading", { name: WORKFLOW.name })).toBeInTheDocument();
    expect(screen.getByTestId(`${BreadcrumbTestId.Item}-0`)).toHaveAttribute(
      "href",
      "/work/workflows",
    );
    expect(screen.queryByRole("button", { name: "Přidat workflow" })).not.toBeInTheDocument();
  });
});

describe("workflows Screen — inline edit", () => {
  it("toggles the detail canvas editable (no dialog), pre-filling one node per phase", async () => {
    hooks.workflows = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="delivery" />);

    // Read mode: the canvas is static, no dialog is mounted.
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));

    expect(screen.queryByRole("dialog")).toBeNull();
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
