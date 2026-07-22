import { renderWithProviders as render, screen, within } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  type Agent,
  SUBSYSTEMS,
  type SubsystemRoster,
  type SubsystemWithStatus,
} from "@zibby/contracts";
import type { Pipeline } from "../../../../domain";
import {
  NODE_H,
  NODE_W,
  phasesToGraph,
} from "../../../pipelines/components/PipelineDialog/pipeline-graph";
import { RosterTab, RosterTabTestId, computeFitTransform } from "./RosterTab";

const AGENTS: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  {
    id: "tester",
    name: "Tester",
    glyph: "flask",
    instructions: "test",
    description: "Runs the test suite",
    // Deliberately different from any phase-level `model` override below, so a
    // test can prove the crew badge reads the *agent's* model, not the phase's.
    model: "haiku",
  },
];

const FORGE: SubsystemWithStatus = {
  ...SUBSYSTEMS.find((s) => s.id === "forge")!,
  state: "idle",
  tier2Count: 0,
  tier3Count: 0,
  errorCount: 0,
};

function pipelineFixture(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
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
    ],
    ...overrides,
  };
}

/** A wide linear chain (mirrors Loom's real 5-node "Code Audit" pipeline the
 * architect review flagged) — wide enough that `phasesToGraph`'s auto-layout
 * overflows the drawer's narrow panel and exercises the fit-to-view shrink. */
function wideChainPhases(count: number): Pipeline["phases"] {
  return Array.from({ length: count }, (_, i) => ({
    id: `phase-${i}`,
    type: "agent" as const,
    agent: "writer",
    consumes: i === 0 ? "task.md" : `out-${i - 1}.md`,
    produces: `out-${i}.md`,
    model: "sonnet" as const,
    thinking: "medium" as const,
  }));
}

/** Reads the numeric `scale`/`translate` out of a `PipelineFit` wrapper's
 * inline `transform` style (jsdom parses it into a `CSSStyleDeclaration`, but
 * exposes no computed matrix, so this parses the source string directly). */
function readTransform(el: HTMLElement): { scale: number; tx: number; ty: number } {
  const transform = el.style.transform;
  const scaleMatch = /scale\(([-\d.]+)\)/.exec(transform);
  const translateMatch = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
  if (!scaleMatch || !translateMatch) {
    throw new Error(`unparseable transform: "${transform}"`);
  }
  return {
    scale: Number.parseFloat(scaleMatch[1]!),
    tx: Number.parseFloat(translateMatch[1]!),
    ty: Number.parseFloat(translateMatch[2]!),
  };
}

const EMPTY_ROSTER: SubsystemRoster = { agents: [], integrations: [], monitors: [] };

const { hooks } = vi.hoisted(() => ({
  hooks: {
    pipelines: [] as Pipeline[],
    createPipeline: vi.fn(),
    updatePipeline: vi.fn(),
    roster: undefined as unknown,
  },
}));

vi.mock("../../../pipelines", () => ({
  usePipelinesQuery: () => ({ data: hooks.pipelines }),
  useCreatePipelineMutation: () => ({ mutate: hooks.createPipeline, isPending: false }),
  useUpdatePipelineMutation: () => ({ mutate: hooks.updatePipeline, isPending: false }),
}));
vi.mock("../../../agents", () => ({ useAgentsQuery: () => ({ data: AGENTS }) }));
vi.mock("../../queries/useSubsystemRosterQuery", () => ({
  useSubsystemRosterQuery: () => ({ data: hooks.roster }),
}));

describe("RosterTab (Phase 85)", () => {
  it("filters pipelines to ones owned by the subsystem", () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }),
      pipelineFixture({ id: "code-audit", name: "Code Audit", ownerSubsystem: "loom" }),
      pipelineFixture({ id: "untagged", name: "Untagged" }),
    ];

    render(<RosterTab subsystem={FORGE} />);

    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.queryByText("Code Audit")).toBeNull();
    expect(screen.queryByText("Untagged")).toBeNull();
  });

  it("renders a read-only canvas per owned pipeline — no ports, no delete affordances", () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }),
    ];

    render(<RosterTab subsystem={FORGE} />);

    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(1);
    expect(screen.queryByTestId("node-delete")).toBeNull();
    expect(screen.queryByTestId("node-port-out")).toBeNull();
  });

  it("clicking a node opens the pipeline's existing config surface (PipelineDialog, edit mode)", async () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }),
    ];
    const user = userEvent.setup();

    render(<RosterTab subsystem={FORGE} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByTestId("pipeline-node"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Název pipeline")).toHaveValue("Delivery");
  });

  it("shows the empty state and pre-fills the create dialog's ownerSubsystem into the create payload", async () => {
    hooks.pipelines = [];
    hooks.createPipeline.mockReset();
    const user = userEvent.setup();

    render(<RosterTab subsystem={FORGE} />);
    expect(screen.getByText("Zatím žádná pipeline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Přidat pipeline" }));
    await user.type(screen.getByLabelText("Název pipeline"), "Nová");
    await user.click(screen.getByTestId("palette-agent-writer"));
    await user.click(screen.getByRole("button", { name: /Vytvořit pipeline/ }));

    expect(hooks.createPipeline).toHaveBeenCalledTimes(1);
    const [{ body }] = hooks.createPipeline.mock.calls[0] as [
      { body: { ownerSubsystem?: string } },
    ];
    expect(body.ownerSubsystem).toBe("forge");
  });

  it("fit-to-view: shrinks a wide chain's canvas transform to less than 1:1 (architect-review fix)", () => {
    hooks.pipelines = [
      pipelineFixture({
        id: "code-audit",
        name: "Code Audit",
        ownerSubsystem: "forge",
        phases: wideChainPhases(5),
      }),
    ];

    render(<RosterTab subsystem={FORGE} />);

    // jsdom never runs ResizeObserver, so the component falls back to its
    // documented default viewport guess — deterministic in tests.
    const fitEl = screen.getByTestId(RosterTabTestId.PipelineFit);
    const { scale } = readTransform(fitEl);
    expect(scale).toBeLessThan(1);

    // Every node in the chain must fall fully inside the panel post-scale —
    // i.e. it's genuinely a *fit*, not just "smaller than before".
    const nodes = phasesToGraph(hooks.pipelines[0]!, AGENTS).nodes;
    const { scale: s, tx, ty } = readTransform(fitEl);
    for (const n of nodes) {
      expect(n.x * s + tx).toBeGreaterThanOrEqual(-0.5);
      expect((n.x + NODE_W) * s + tx).toBeLessThanOrEqual(340 + 0.5);
      expect(n.y * s + ty).toBeGreaterThanOrEqual(-0.5);
      expect((n.y + NODE_H) * s + ty).toBeLessThanOrEqual(340 + 0.5);
    }
  });

  it("fit-to-view: does not shrink a chain that already fits (stays 1:1)", () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }),
    ];

    render(<RosterTab subsystem={FORGE} />);

    const { scale } = readTransform(screen.getByTestId(RosterTabTestId.PipelineFit));
    expect(scale).toBe(1);
  });
});

describe("RosterTab crew — stored roster (NS2 F1c)", () => {
  it("renders the crew from the roster query's agent refs, hydrated against the resolved agents list", () => {
    hooks.pipelines = [];
    hooks.roster = {
      agents: [{ id: "writer" }, { id: "tester" }],
      integrations: [],
      monitors: [],
    } satisfies SubsystemRoster;

    render(<RosterTab subsystem={FORGE} />);

    const crewSection = screen.getByTestId(RosterTabTestId.CrewSection);
    expect(within(crewSection).getByText("Posádka")).toBeInTheDocument();

    const rows = within(crewSection).getAllByTestId(RosterTabTestId.CrewRow);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Writer")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Tester")).toBeInTheDocument();
  });

  it("a roster agent ref with no match in the resolved agents list is skipped (stale reference)", () => {
    hooks.pipelines = [];
    hooks.roster = {
      agents: [{ id: "writer" }, { id: "ghost" }],
      integrations: [],
      monitors: [],
    } satisfies SubsystemRoster;

    render(<RosterTab subsystem={FORGE} />);

    const rows = screen.getAllByTestId(RosterTabTestId.CrewRow);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Writer")).toBeInTheDocument();
  });

  it("shows the agent's own model as a badge, hydrated from the resolved agents list", () => {
    hooks.pipelines = [];
    hooks.roster = {
      agents: [{ id: "tester" }],
      integrations: [],
      monitors: [],
    } satisfies SubsystemRoster;

    render(<RosterTab subsystem={FORGE} />);

    const row = screen.getByTestId(RosterTabTestId.CrewRow);
    expect(within(row).getByText("Tester")).toBeInTheDocument();
    expect(within(row).getByText("Runs the test suite")).toBeInTheDocument();
    expect(within(row).getByText("haiku")).toBeInTheDocument();
  });

  it("a crew row navigates to the agent's own detail page", () => {
    hooks.pipelines = [];
    hooks.roster = {
      agents: [{ id: "writer" }],
      integrations: [],
      monitors: [],
    } satisfies SubsystemRoster;

    render(<RosterTab subsystem={FORGE} />);

    const link = screen.getByRole("link", { name: /Writer/ });
    expect(link).toHaveAttribute("href", "/agents/writer");
  });

  it("renders no crew section when the roster's agents list is empty", () => {
    hooks.pipelines = [];
    hooks.roster = EMPTY_ROSTER;

    render(<RosterTab subsystem={FORGE} />);

    expect(screen.queryByTestId(RosterTabTestId.CrewSection)).toBeNull();
    expect(screen.queryByTestId(RosterTabTestId.CrewRow)).toBeNull();
  });

  it("renders no crew section while the roster query hasn't resolved yet", () => {
    hooks.pipelines = [];
    hooks.roster = undefined;

    render(<RosterTab subsystem={FORGE} />);

    expect(screen.queryByTestId(RosterTabTestId.CrewSection)).toBeNull();
  });
});

describe("RosterTab integrations + monitors (NS2 F1c)", () => {
  it("renders owned integrations, excluding the ci-monitor subset from the integrations section", () => {
    hooks.pipelines = [];
    hooks.roster = {
      agents: [],
      integrations: [
        { id: "team-slack", name: "Team Slack", kind: "slack" },
        { id: "ci-repo", name: "CI Repo", kind: "github" },
      ],
      monitors: [{ id: "ci-repo", name: "CI Repo", kind: "github" }],
    } satisfies SubsystemRoster;

    render(<RosterTab subsystem={FORGE} />);

    const integrationSection = screen.getByTestId(RosterTabTestId.IntegrationSection);
    expect(within(integrationSection).getByText("Team Slack")).toBeInTheDocument();
    expect(within(integrationSection).queryByText("CI Repo")).toBeNull();

    const monitorSection = screen.getByTestId(RosterTabTestId.MonitorSection);
    expect(within(monitorSection).getByText("CI Repo")).toBeInTheDocument();
  });

  it("renders no integrations/monitors sections when the roster owns none", () => {
    hooks.pipelines = [];
    hooks.roster = EMPTY_ROSTER;

    render(<RosterTab subsystem={FORGE} />);

    expect(screen.queryByTestId(RosterTabTestId.IntegrationSection)).toBeNull();
    expect(screen.queryByTestId(RosterTabTestId.MonitorSection)).toBeNull();
  });
});

describe("computeFitTransform (Phase 85 architect-review fix)", () => {
  const nodesFor = (count: number) =>
    phasesToGraph(pipelineFixture({ phases: wideChainPhases(count) }), AGENTS).nodes;

  it("returns an identity transform for an empty graph", () => {
    expect(computeFitTransform([], 380, 340)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it("computes the exact shrink scale for a wide 5-node chain in a 380×340 viewport", () => {
    const nodes = nodesFor(5);
    const viewportW = 380;
    const viewportH = 340;

    const { scale, tx, ty } = computeFitTransform(nodes, viewportW, viewportH);

    // bbox: x from 56 to 56+4*272+188=1332 (width 1276), y from 200 to 264
    // (height 64). Width is the binding constraint: (380-32)/1276 = 3/11.
    expect(scale).toBeCloseTo(3 / 11, 6);

    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));

    // Symmetric 16px padding on the binding (horizontal) axis.
    expect(minX * scale + tx).toBeCloseTo(16, 3);
    expect(maxX * scale + tx).toBeCloseTo(viewportW - 16, 3);

    // Vertically centered on the slack axis — well past the 16px padding
    // floor, and symmetric top/bottom margins.
    const top = minY * scale + ty;
    const bottom = maxY * scale + ty;
    expect(top).toBeGreaterThan(16);
    expect(viewportH - bottom).toBeCloseTo(top, 3);
  });

  it("never scales a chain up past 1:1, and still centers it", () => {
    const nodes = nodesFor(1);
    const viewportW = 380;
    const viewportH = 340;

    const { scale, tx, ty } = computeFitTransform(nodes, viewportW, viewportH);
    expect(scale).toBe(1);

    const node = nodes[0]!;
    expect(node.x * scale + tx).toBeCloseTo(viewportW / 2 - NODE_W / 2, 3);
    expect((node.x + NODE_W) * scale + tx).toBeCloseTo(viewportW / 2 + NODE_W / 2, 3);
    expect(node.y * scale + ty).toBeCloseTo(viewportH / 2 - NODE_H / 2, 3);
    expect((node.y + NODE_H) * scale + ty).toBeCloseTo(viewportH / 2 + NODE_H / 2, 3);
  });

  it("treats a non-positive viewport as identity (defensive — no NaN/Infinity leaks)", () => {
    const nodes = nodesFor(3);
    expect(computeFitTransform(nodes, 0, 340)).toEqual({ scale: 1, tx: 0, ty: 0 });
    expect(computeFitTransform(nodes, 380, 0)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});
