import { type ArtifactRecord, DEPARTMENTS, type DepartmentWithStatus } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../../test/render";
import type { Pipeline } from "../../../../domain";
import { ArtefaktyTab, ArtefaktyTabTestId } from "./ArtefaktyTab";

const DEV: DepartmentWithStatus = {
  ...DEPARTMENTS.find((s) => s.id === "dev")!,
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

function artifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "run-1_pr_report-md",
    kind: "pr",
    locator: "https://github.com/example/repo/pull/1",
    from: "report.md",
    producedBy: { runRef: "run-1", pipelineId: "delivery" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const { hooks } = vi.hoisted(() => ({
  hooks: {
    pipelines: [] as Pipeline[],
    artifacts: [] as ArtifactRecord[],
  },
}));

vi.mock("../../../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));
vi.mock("../../../artifacts", () => ({ useArtifactsQuery: () => ({ data: hooks.artifacts }) }));

describe("ArtefaktyTab (Phase 88)", () => {
  beforeEach(() => {
    hooks.pipelines = [];
    hooks.artifacts = [];
  });

  it("renders both sink labels for a pr and a file(vault) output, defaulting to the honest → operátor receiver", () => {
    hooks.pipelines = [
      pipelineFixture({
        id: "delivery",
        department: "dev",
        outputs: [
          { type: "pr", from: "pr-draft.md" },
          { type: "file", from: "report.md", dest: "vault", to: "audit-report" },
        ],
      }),
    ];
    hooks.artifacts = [];

    render(<ArtefaktyTab department={DEV} />);

    const rows = screen.getAllByTestId(ArtefaktyTabTestId.ProduceRow);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("PR na review");
    expect(rows[0]).toHaveTextContent("→ operátor");
    expect(rows[1]).toHaveTextContent("poznámka → vault");
    expect(rows[1]).toHaveTextContent("→ operátor");
  });

  it("shows an honest single-line note when owned pipelines configure no outputs", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", department: "dev", outputs: [] })];
    hooks.artifacts = [];

    render(<ArtefaktyTab department={DEV} />);

    expect(screen.getByTestId(ArtefaktyTabTestId.ProduceEmpty)).toBeInTheDocument();
    expect(screen.queryByTestId(ArtefaktyTabTestId.ProduceRow)).toBeNull();
  });

  it("history filters the artifact registry to runs of owned pipelines only", () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", department: "dev" }),
      pipelineFixture({ id: "other", department: "qa" }),
    ];
    hooks.artifacts = [
      artifactFixture({ id: "owned-1", producedBy: { runRef: "run-1", pipelineId: "delivery" } }),
      artifactFixture({
        id: "unowned-1",
        producedBy: { runRef: "run-2", pipelineId: "other" },
        kind: "vault-note",
        locator: "note-1",
        from: "notes.md",
      }),
    ];

    render(<ArtefaktyTab department={DEV} />);

    const rows = screen.getAllByTestId(ArtefaktyTabTestId.HistoryRow);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("report.md");
  });

  it("a pr artifact's link opens externally with rel=noreferrer", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", department: "dev" })];
    hooks.artifacts = [artifactFixture()];

    render(<ArtefaktyTab department={DEV} />);

    const link = screen.getByTestId(ArtefaktyTabTestId.ArtifactLink);
    expect(link).toHaveAttribute("href", "https://github.com/example/repo/pull/1");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows an honest empty state for the history section when the department owns pipelines but nothing was delivered", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", department: "dev" })];
    hooks.artifacts = [];

    render(<ArtefaktyTab department={DEV} />);

    expect(screen.getByTestId(ArtefaktyTabTestId.HistoryEmpty)).toBeInTheDocument();
  });

  it("shows a single combined empty state, translated, when the department owns no pipeline at all", () => {
    hooks.pipelines = [];
    hooks.artifacts = [];

    render(<ArtefaktyTab department={DEV} />);

    expect(screen.getByTestId(ArtefaktyTabTestId.CombinedEmpty)).toBeInTheDocument();
    expect(
      screen.getByText("Tohle oddělení si zatím nevlastní žádnou pipeline"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(ArtefaktyTabTestId.Produce)).toBeNull();
    expect(screen.queryByTestId(ArtefaktyTabTestId.History)).toBeNull();
  });
});
