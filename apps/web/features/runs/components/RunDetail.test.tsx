import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  CodeBlockTestId,
  DropdownTestId,
  EntityHeroTestId,
  FilePreviewTestId,
  MarkdownTestId,
  MenuButtonTestId,
} from "@zibby/design-system";
import type { RunView } from "../run";
import { RunDetail } from "./RunDetail";

// Phase 63: the header's worker name (agent/pipeline) navigates to its own detail
// page — a local mock (overriding the global next/navigation stub in
// vitest.setup.tsx) so tests can assert the exact path `push` was called with.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// No run is on the approval gate in these cases — an empty queue keeps the header
// in its plain (no severity/risk) form.
vi.mock("../../approvals/queries", () => ({ useApprovalsQuery: () => ({ data: [] }) }));
// A pipeline run's body is the stage timeline; stub it so this test focuses on the
// header + meta strip (the timeline has its own test).
vi.mock("./PipelineStageTimeline", () => ({
  PipelineStageTimeline: () => <div data-testid="stage-timeline" />,
}));
// The output panel's "continue in a new task" reads the New Task provider; these
// header/meta tests render RunDetail in isolation, so stub it with a shared spy.
const { openNewTask } = vi.hoisted(() => ({ openNewTask: vi.fn() }));
vi.mock("../../tasks/TaskContext", () => ({
  useNewTask: () => ({ open: openNewTask, close: vi.fn(), isOpen: false }),
}));
// The pipeline output panel reads the run's pr-draft (or, for a file output, its
// named artifact) — keyed by `runId:name` so a run only "has" the artifact its test
// scenario actually gives it (mirroring a real 404 for the artifact that wasn't
// written), and none when the query is gated off.
const ARTIFACT_CONTENT: Record<string, string> = {
  "delivery_42:pr-draft.md": "# Add login fix\n\nDetails…",
  "delivery_file_43:audit-report.md": "# Audit report\n\nAll green.",
  "delivery_file_45:report.json": '{"ok":true}',
};
vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: (runId: string, name: string, enabled = true) => {
    const content = ARTIFACT_CONTENT[`${runId}:${name}`];
    return { data: enabled && content ? { name, content } : undefined };
  },
}));
vi.mock("../../pipelines", () => ({ usePipelineRunQuery: () => ({ data: undefined }) }));
// The Phase 24 Part D "Projekt" control reads the project registry and
// its own assign mutation; an empty registry keeps it a no-op for every test here
// that doesn't specifically exercise it.
const { projectsRef, assignMutate } = vi.hoisted(() => ({
  projectsRef: { current: [] as { id: string; name: string }[] },
  assignMutate: vi.fn(),
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: projectsRef.current }) }));
vi.mock("../mutations", () => ({
  useAssignRunProjectMutation: () => ({ mutate: assignMutate, isPending: false }),
}));
// Pin the API origin (Phase 65's open-file serve URL) so the attachment link's `href`
// is deterministic — the API is a separate server, never a same-origin relative path.
// Partial mock: `apiClient` (used transitively by useApprovalsQuery et al.) must stay real.
vi.mock("../../../state/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/api")>()),
  API_URL: "http://api.test",
}));

const LONG_DESC =
  "Refaktoruj detail běhu pipeliny tak, aby nezobrazoval název úkolu dvakrát, " +
  "ukázal přiřazenou pipelinu a přidal sbalitelný popis úkolu s tlačítkem zobrazit " +
  "více; po rozbalení nabídni zobrazit méně a dej pozor na zachování všech ostatních " +
  "informací v hlavičce běhu i v časové ose jednotlivých fází.";

const pipelineRun: RunView = {
  runId: "delivery_42",
  kind: "pipeline",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "fáze: build",
  project: "z.i.b.b.y",
  startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
  logBase: null,
  taskTitle: "Oprav detail běhu",
  taskText: LONG_DESC,
  stageRuns: [],
};

const renderDetail = (run: RunView = pipelineRun) =>
  render(
    <RunDetail
      deleting={false}
      glyph="flow"
      now={Date.parse("2026-06-14T10:05:00Z")}
      onDelete={() => {}}
      onStop={() => {}}
      run={run}
      stopping={false}
    />,
  );

describe("RunDetail — pipeline header", () => {
  it("shows the task name once (headline only, not repeated as a meta cell)", () => {
    renderDetail();
    expect(screen.getAllByText("Oprav detail běhu")).toHaveLength(1);
  });

  it("surfaces the assigned pipeline and drops the redundant type cell", () => {
    renderDetail();
    expect(screen.getByText("pipelina")).toBeInTheDocument();
    expect(screen.getByText("delivery")).toBeInTheDocument();
    // "typ" (kind) cell is gone — kind still reads in the mono id line, not a cell.
    expect(screen.queryByText("typ")).not.toBeInTheDocument();
  });

  it("keeps the task description out of the header — no inline text, no show-more toggle (Phase 64)", () => {
    renderDetail();
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
    expect(screen.queryByText("zobrazit více")).not.toBeInTheDocument();
  });

  it('shows a collapsed "Vstup" section that expands to reveal the full formatted task input', async () => {
    renderDetail();
    // Collapsed by default: the accordion summary is there, its content is not.
    const summary = screen.getByRole("button", { name: /Vstup/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
    await userEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(LONG_DESC)).toBeInTheDocument();
  });

  it('shows the task\'s attachments read-only (no remove button) inside the expanded "Vstup" section', async () => {
    renderDetail({
      ...pipelineRun,
      attachments: [
        { name: "spec.pdf", size: 100 },
        { name: "data.csv", size: 200 },
      ],
    });
    expect(screen.queryByTestId(FilePreviewTestId.Name)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Vstup"));
    expect(screen.getAllByTestId(FilePreviewTestId.Name)).toHaveLength(2);
    expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.queryByTestId(FilePreviewTestId.Remove)).not.toBeInTheDocument();
  });

  it("shows open links to the serve URL when the run carries an attachmentSetId (Phase 65)", async () => {
    renderDetail({
      ...pipelineRun,
      attachmentSetId: "set_abc",
      attachments: [
        { name: "spec.pdf", size: 100 },
        { name: "a b.csv", size: 200 },
      ],
    });
    await userEvent.click(screen.getByText("Vstup"));
    const links = screen.getAllByTestId("attachment-open-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "http://api.test/api/tasks/attachments/set_abc/spec.pdf",
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "http://api.test/api/tasks/attachments/set_abc/a%20b.csv",
    );
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("keeps the read-only attachments list when the run has no attachmentSetId", async () => {
    renderDetail({
      ...pipelineRun,
      attachments: [{ name: "spec.pdf", size: 100 }],
    });
    await userEvent.click(screen.getByText("Vstup"));
    expect(screen.queryByTestId("attachment-open-link")).not.toBeInTheDocument();
    expect(screen.getByTestId(FilePreviewTestId.Name)).toBeInTheDocument();
  });

  it('renders no "Vstup" section when the run has neither task text nor attachments', () => {
    renderDetail({ ...pipelineRun, taskText: undefined });
    expect(screen.queryByRole("button", { name: /Vstup/ })).not.toBeInTheDocument();
  });

  it("shows a formatted cost meta cell when costUsd is set", () => {
    renderDetail({ ...pipelineRun, costUsd: 0.2934669 });
    expect(screen.getByText("cena")).toBeInTheDocument();
    expect(screen.getByText("$0.29")).toBeInTheDocument();
  });

  it("omits the cost cell entirely when costUsd is absent", () => {
    renderDetail();
    expect(screen.queryByText("cena")).not.toBeInTheDocument();
  });

  it("carries the written-back task outcome on the task meta cell when the title differs from the headline", () => {
    renderDetail({
      ...pipelineRun,
      title: "Pipeline run headline",
      taskTitle: "Oprav rozbitý test",
      taskOutcome: "done",
    });
    expect(screen.getByText(/Oprav rozbitý test → úspěch/)).toBeInTheDocument();
  });

  it("shows the total run duration once the task outcome carries a finish time", () => {
    renderDetail({
      ...pipelineRun,
      startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
      taskOutcomeFinishedAt: new Date("2026-06-14T10:03:12Z").toISOString(),
    });
    expect(screen.getByText("délka běhu")).toBeInTheDocument();
    expect(screen.getByText("3m 12s")).toBeInTheDocument();
  });

  it("omits the duration cell while the run has no written-back finish time", () => {
    renderDetail();
    expect(screen.queryByText("délka běhu")).not.toBeInTheDocument();
  });
});

describe("RunDetail — header avatar (Phase 48 → 53: stretched EntityHero background)", () => {
  it("renders the assigned entity's avatar as the stretched header background when provided", () => {
    render(
      <RunDetail
        avatar="/avatars/delivery.png"
        deleting={false}
        glyph="flow"
        now={Date.parse("2026-06-14T10:05:00Z")}
        onDelete={() => {}}
        onStop={() => {}}
        run={pipelineRun}
        stopping={false}
      />,
    );
    // The avatar now fills the header band (EntityHero object-cover image), not a tile.
    expect(screen.getByTestId(EntityHeroTestId.Image)).toHaveAttribute(
      "src",
      "/avatars/delivery.png",
    );
  });

  it("falls back to the glyph (no image) when no avatar is provided", () => {
    renderDetail(); // renderDetail passes no `avatar`
    expect(screen.queryByTestId(EntityHeroTestId.Image)).not.toBeInTheDocument();
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
  });

  it("keeps the delete action functional alongside the header avatar background", async () => {
    const onDelete = vi.fn();
    render(
      <RunDetail
        avatar="/avatars/delivery.png"
        deleting={false}
        glyph="flow"
        now={Date.parse("2026-06-14T10:05:00Z")}
        onDelete={onDelete}
        onStop={() => {}}
        run={{ ...pipelineRun, status: "done" }}
        stopping={false}
      />,
    );
    // The avatar band and the actions coexist in the header.
    expect(screen.getByTestId(EntityHeroTestId.Root)).toBeInTheDocument();
    // Delete now lives behind the kebab menu; opening it and activating the row
    // still opens the confirm dialog and, on confirm, calls onDelete (the full
    // confirm flow is covered in RunDetailConfirm.test.tsx — this guards the swap).
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-delete`));
    await userEvent.click(screen.getByRole("button", { name: "Smazat" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("RunDetail — task output", () => {
  const doneWithPr: RunView = {
    runId: "writer_7",
    kind: "agent",
    owner: "writer",
    status: "done",
    pct: null,
    title: "",
    prompt: "",
    project: "z.i.b.b.y",
    startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
    logBase: "agents",
    taskTitle: "Fix the login bug",
    taskText: "Fix the login bug",
    taskOutcome: "done",
    taskOutputKind: "pr",
    taskOutcomeSummary: "PR otevřen: https://github.com/acme/app/pull/42",
  };

  it("opens the PR url from the outcome summary in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDetail(doneWithPr);
    await userEvent.click(screen.getByTestId("open-output"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/acme/app/pull/42",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("shows the agent's outcome summary in a scrolled code block, not a bare paragraph", () => {
    renderDetail(doneWithPr);
    expect(screen.getByTestId(CodeBlockTestId.Pre)).toHaveTextContent(
      "PR otevřen: https://github.com/acme/app/pull/42",
    );
  });

  it("continues in a new task with the prior output folded into context", async () => {
    openNewTask.mockClear();
    renderDetail(doneWithPr);
    await userEvent.click(screen.getByTestId("continue-task"));
    expect(openNewTask).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.stringContaining("https://github.com/acme/app/pull/42"),
    );
  });

  it("hides the output panel for a void-output run", () => {
    renderDetail({ ...doneWithPr, taskOutputKind: "void" });
    expect(screen.queryByTestId("open-output")).not.toBeInTheDocument();
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
  });

  it("hides the output panel while the run is still running", () => {
    renderDetail({ ...doneWithPr, status: "running" });
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
  });

  const doneWithPrOutput: RunView = {
    ...doneWithPr,
    prOutput: { url: "https://github.com/acme/app/pull/42", additions: 12, deletions: 3 },
  };

  it("PR output: renders just the PR link and coloured +/− line totals", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDetail(doneWithPrOutput);
    expect(screen.getByTestId("pr-additions")).toHaveTextContent("+12");
    expect(screen.getByTestId("pr-deletions")).toHaveTextContent("−3");
    await userEvent.click(screen.getByTestId("open-pr"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/acme/app/pull/42",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("PR output: shows only the link + totals — no legacy summary/open-output/continue", () => {
    renderDetail(doneWithPrOutput);
    expect(screen.queryByTestId("open-output")).not.toBeInTheDocument();
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
  });

  it("surfaces a done pipeline run's PR draft as its output and offers continue", async () => {
    openNewTask.mockClear();
    renderDetail({ ...pipelineRun, status: "done", taskOutcome: "done" });
    // The produced PR draft (artifact) is shown as the output.
    expect(screen.getByText(/Add login fix/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("continue-task"));
    expect(openNewTask).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.stringContaining("Add login fix"),
    );
  });

  it("surfaces a done pipeline run's markdown file output as formatted markdown, not a code block (Phase 41)", async () => {
    openNewTask.mockClear();
    renderDetail({
      ...pipelineRun,
      runId: "delivery_file_43",
      status: "done",
      taskOutcome: "done",
      taskOutputKind: "file",
      outputArtifactName: "audit-report.md",
    });
    // The produced `.md` artifact renders through the DS Markdown viewer — its
    // heading becomes a real heading element, not a bare code block.
    expect(screen.getByTestId(MarkdownTestId.Root)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit report" })).toBeInTheDocument();
    expect(screen.queryByTestId(CodeBlockTestId.Pre)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("continue-task"));
    expect(openNewTask).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.stringContaining("Audit report"),
    );
    // Never the generic "N stages, done" pipeline summary.
    expect(openNewTask).not.toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.stringContaining("stages, done"),
    );
  });

  it("keeps a non-markdown file output (e.g. .json) in a code block, not the markdown viewer (Phase 41)", () => {
    renderDetail({
      ...pipelineRun,
      runId: "delivery_file_45",
      status: "done",
      taskOutcome: "done",
      taskOutputKind: "file",
      outputArtifactName: "report.json",
    });
    expect(screen.getByTestId(CodeBlockTestId.Pre)).toHaveTextContent('{"ok":true}');
    expect(screen.queryByTestId(MarkdownTestId.Root)).not.toBeInTheDocument();
  });

  it("renders nothing for a done pipeline file-output run whose artifact hasn't arrived (never falls into the agent-shaped branch)", () => {
    renderDetail({
      ...pipelineRun,
      runId: "delivery_file_44",
      status: "done",
      taskOutcome: "done",
      taskOutputKind: "file",
      outputArtifactName: "missing-report.md",
      // A generic pipeline outcome string — if the agent-shaped branch's guard were
      // missing, this would render as a bogus "continue" context.
      taskOutcomeSummary: "5 stages, done",
    });
    expect(screen.queryByTestId(CodeBlockTestId.Pre)).not.toBeInTheDocument();
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
    expect(screen.queryByText(/stages, done/)).not.toBeInTheDocument();
  });
});

describe("RunDetail — worker name links to its detail (Phase 63)", () => {
  const agentRun: RunView = {
    runId: "writer_7",
    kind: "agent",
    owner: "writer",
    status: "done",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
    logBase: "agents",
  };

  const chainRun: RunView = {
    runId: "research-then-build_9",
    kind: "chain",
    owner: "research-then-build",
    status: "running",
    pct: null,
    title: "",
    prompt: "krok 1/2",
    project: "",
    startedAt: new Date("2026-07-02T08:00:00Z").toISOString(),
    logBase: null,
    chainId: "research-then-build",
    steps: [{ index: 0, pipeline: "nightly-research", status: "pending" }],
  };

  beforeEach(() => {
    push.mockClear();
  });

  it("links the agent name in the meta line to its own detail page", async () => {
    renderDetail(agentRun);
    await userEvent.click(screen.getByTestId("run-agent-link"));
    expect(push).toHaveBeenCalledWith("/agents/writer");
  });

  it("links the pipeline owner meta cell to its own detail page", async () => {
    renderDetail(); // default pipelineRun: kind "pipeline", owner "delivery"
    await userEvent.click(screen.getByTestId("run-owner-link"));
    expect(push).toHaveBeenCalledWith("/pipelines/delivery");
  });

  it("keeps a chain run's owner meta cell as plain text — no detail route to link to", () => {
    renderDetail(chainRun);
    expect(screen.queryByTestId("run-owner-link")).not.toBeInTheDocument();
    expect(screen.getByText("research-then-build")).toBeInTheDocument();
  });
});

describe("RunDetail — assign to project (Phase 24 Part D)", () => {
  beforeEach(() => {
    projectsRef.current = [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ];
    assignMutate.mockClear();
  });

  it("shows the assign control in place of the project meta cell for a project-less run", () => {
    renderDetail();
    expect(screen.getByText("Projekt")).toBeInTheDocument();
    expect(screen.queryByText("projekt")).not.toBeInTheDocument();
  });

  it("hides the assign control when the project registry is empty", () => {
    projectsRef.current = [];
    renderDetail();
    expect(screen.queryByText("Projekt")).not.toBeInTheDocument();
  });

  it("shows the project meta cell (not the assign control) once the run carries a projectId", () => {
    renderDetail({ ...pipelineRun, project: "Acme", projectId: "alpha" });
    expect(screen.getByText("projekt")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByText("Projekt")).not.toBeInTheDocument();
  });

  it("assigns the chosen project via the mutation", async () => {
    renderDetail();
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const alpha = options.find((o) => o.textContent === "Alpha");
    expect(alpha).toBeDefined();
    if (alpha) await userEvent.click(alpha);
    expect(assignMutate).toHaveBeenCalledWith({
      params: { runId: pipelineRun.runId },
      body: { projectId: "alpha" },
    });
  });
});

describe("RunDetail — started time is absolute, not relative (Phase 67 item A)", () => {
  it("shows the started meta cell as an absolute formatted date/time, not a relative 'před …' string", () => {
    const startedAt = new Date("2026-06-14T10:00:00Z").toISOString();
    renderDetail({ ...pipelineRun, startedAt });
    expect(screen.getByText(new Date(startedAt).toLocaleString("cs"))).toBeInTheDocument();
    expect(screen.queryByText(/^před /)).not.toBeInTheDocument();
  });

  it("keeps a scheduled run's future time in the relative 'in Xm' form (unchanged)", () => {
    renderDetail({
      ...pipelineRun,
      status: "scheduled",
      startedAt: new Date("2026-06-14T10:10:00Z").toISOString(),
    });
    expect(screen.getByText("za 5 m")).toBeInTheDocument();
  });
});

describe("RunDetail — classification trace (F2c)", () => {
  it("renders the switchboard trace, subsystem hop, and confidence when the run carries one", () => {
    renderDetail({
      ...pipelineRun,
      classification: {
        stage1: { kind: "subsystem", id: "forge", name: "Forge" },
        confidence: 0.82,
        reason: "matched keywords: fix, bug",
        matchedTerms: ["fix", "bug"],
        subsystem: "forge",
      },
    });
    expect(screen.getByTestId("classification-trace")).toBeInTheDocument();
    expect(screen.getByText("matched keywords: fix, bug")).toBeInTheDocument();
    expect(screen.getByTestId("classification-confidence")).toHaveTextContent("82");
  });

  it("renders nothing when the run carries no classification trace", () => {
    renderDetail(pipelineRun);
    expect(screen.queryByTestId("classification-trace")).not.toBeInTheDocument();
  });
});

describe("RunDetail — project meta cell links to project detail (Phase 67 item B)", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("links the project meta cell to its detail page when the run carries a projectId", async () => {
    renderDetail({ ...pipelineRun, project: "Acme", projectId: "alpha" });
    await userEvent.click(screen.getByTestId("run-project-link"));
    expect(push).toHaveBeenCalledWith("/projects/alpha");
  });

  it("shows the assign control (not a link) for a project-less run", () => {
    renderDetail();
    expect(screen.queryByTestId("run-project-link")).not.toBeInTheDocument();
    expect(screen.getByText("Projekt")).toBeInTheDocument();
  });
});
