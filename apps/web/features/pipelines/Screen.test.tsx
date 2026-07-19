import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent, UpdatePipelineInput } from "@zibby/contracts";
import { EntityHeroTestId, ImmersiveShellTestId } from "@zibby/design-system";
import { ImmersivePageTestId } from "../../components/layout/ImmersivePage/ImmersivePage";
import type { Pipeline } from "../../domain";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AGENTS: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

const PIPELINE: Pipeline = {
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

// A pipeline with an existing chain (agent → verify with a rework loop back to
// the agent) — mirrors the fixture the old `PipelineDialog.test.tsx` edit-mode
// suite used, now exercised through the inline detail-view editor instead.
const EXISTING: Pipeline = {
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
    pipelines: {
      data: [] as Pipeline[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  usePipelinesQuery: () => hooks.pipelines,
  usePipelineRunsQuery: () => ({ data: [] }),
  usePipelineRunQuery: () => ({ data: undefined }),
}));
vi.mock("./mutations", () => ({
  useCreatePipelineMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePipelineMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDuplicatePipelineMutation: () => ({ mutate: vi.fn(), isPending: false }),
  duplicatePipelineBody: vi.fn(),
}));
vi.mock("../agents", () => ({ useAgentsQuery: () => ({ data: AGENTS }) }));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: vi.fn() }) }));

describe("pipelines Screen — avatar hero", () => {
  it("renders the selected pipeline's avatar in the detail hero", () => {
    hooks.pipelines = { data: [PIPELINE], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    const image = screen.getByTestId(EntityHeroTestId.Image);
    expect(image).toHaveAttribute("src", PIPELINE.avatar);
  });
});

// F5 (docs/plans/hud2chat-F5-orchestration.md): one Screen serves both
// `/pipelines` (list) and `/pipelines/[id]` (detail) — `routeId` (the
// `selectedId` prop, absent on the list route) must drive the immersive
// header's title/subtitle/actions and, above all, `backHref` — the single
// most likely defect: it must never loop the detail route's back button
// back to itself.
describe("pipelines Screen — immersive header (F5)", () => {
  it("list route: title is the section name, back goes to /chat, actions offer Add", () => {
    hooks.pipelines = { data: [PIPELINE], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Pipelines");
    expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("button", { name: "Přidat pipeline" })).toBeInTheDocument();
  });

  it("detail route: title is the pipeline's name, back goes to /pipelines, no Add action", () => {
    hooks.pipelines = { data: [PIPELINE], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent(PIPELINE.name);
    expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/pipelines");
    expect(screen.queryByRole("button", { name: "Přidat pipeline" })).not.toBeInTheDocument();
  });
});

describe("pipelines Screen — inline edit", () => {
  it("toggles the detail canvas editable (no dialog), pre-filling one node per phase", async () => {
    hooks.pipelines = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="delivery" />);

    // Read mode: the canvas is static, no dialog is mounted.
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zrušit" })).toBeInTheDocument();
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);
  });

  it("the agents palette is hidden until '+' is clicked, and auto-closes after adding an agent", async () => {
    hooks.pipelines = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    hooks.update.mockReset();
    render(<Screen selectedId="delivery" />);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.queryByTestId("palette-agent-writer")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    expect(screen.getByTestId("palette-agent-writer")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("palette-agent-writer"));

    // Auto-closed after the add, and the new node landed on the canvas.
    expect(screen.queryByTestId("palette-agent-writer")).toBeNull();
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(3);
  });

  it("Save PATCHes only the changed phases", async () => {
    hooks.pipelines = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
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
      { params: { id: string }; body: UpdatePipelineInput },
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
    hooks.pipelines = { data: [EXISTING], isPending: false, isError: false, refetch: vi.fn() };
    hooks.update.mockReset();
    render(<Screen selectedId="delivery" />);

    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    await userEvent.click(screen.getByTestId("palette-agent-tester"));
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(hooks.update).not.toHaveBeenCalled();

    // Back to read mode with the original (unchanged) graph.
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);

    // Re-entering edit re-seeds from the (unchanged) pipeline, not the discarded draft.
    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);
  });
});
