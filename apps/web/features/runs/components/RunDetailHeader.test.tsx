import { renderWithProviders as render, screen, within } from "../../../test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CopyableTextTestId, MetricStripTestId, StatePillTestId } from "@zibby/design-system";
import type { RunView } from "../run";
import type { RunMetric } from "../runDetailModel";
import { RunDetailHeader, RunDetailHeaderTestId } from "./RunDetailHeader";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const { projectsRef, assignMutate } = vi.hoisted(() => ({
  projectsRef: { current: [] as { id: string; name: string }[] },
  assignMutate: vi.fn(),
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: projectsRef.current }) }));
vi.mock("../mutations", () => ({
  useAssignRunProjectMutation: () => ({ mutate: assignMutate, isPending: false }),
}));

const run: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "Fix login",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
  taskId: "T-1",
  stageRuns: [],
};

const metrics: RunMetric[] = (
  ["progress", "elapsed", "stage", "retries", "cost", "confidence"] as const
).map((key) => ({ key, value: "—" }));

function renderHeader(over: Partial<RunView> = {}, compact = false) {
  render(
    <RunDetailHeader
      actions={<span data-testid="actions-slot" />}
      agent={{ id: "coder", name: "Ada", role: "Coder", state: "working" }}
      compact={compact}
      metrics={metrics}
      mode="running"
      progressPct={33}
      run={{ ...run, ...over }}
    />,
  );
}

describe("RunDetailHeader", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    push.mockClear();
    projectsRef.current = [];
  });

  it("renders title, state, actions slot and 6 metrics", () => {
    renderHeader();
    expect(screen.getByTestId(RunDetailHeaderTestId.Title)).toHaveTextContent("Fix login");
    expect(
      within(screen.getByTestId(RunDetailHeaderTestId.State)).getByTestId(StatePillTestId.Label),
    ).toHaveTextContent("Běží");
    expect(screen.getByTestId("actions-slot")).toBeInTheDocument();
    const strip = screen.getByTestId(RunDetailHeaderTestId.Metrics);
    expect(within(strip).getAllByTestId(new RegExp(`^${MetricStripTestId.Item}-`))).toHaveLength(6);
  });

  it("shows the run id with a copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderHeader();
    expect(screen.getByTestId(CopyableTextTestId.Text)).toHaveTextContent("delivery_42");
    await userEvent.click(screen.getByTestId(CopyableTextTestId.Copy));
    expect(writeText).toHaveBeenCalledWith("delivery_42");
  });

  it("back, task and agent links navigate", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId(RunDetailHeaderTestId.Back));
    expect(push).toHaveBeenLastCalledWith("/activity/runs");
    await userEvent.click(screen.getByTestId(RunDetailHeaderTestId.TaskLink));
    expect(push).toHaveBeenLastCalledWith("/work/tasks/T-1");
    await userEvent.click(screen.getByTestId(RunDetailHeaderTestId.AgentLink));
    expect(push).toHaveBeenLastCalledWith("/workforce/agents/coder");
  });

  it("a run with a project links to it", async () => {
    renderHeader({ projectId: "p1", project: "z.i.b.b.y" });
    await userEvent.click(screen.getByTestId(RunDetailHeaderTestId.ProjectLink));
    expect(push).toHaveBeenLastCalledWith("/projects/p1");
    expect(screen.queryByTestId(RunDetailHeaderTestId.AssignProject)).not.toBeInTheDocument();
  });

  it("a project-less run offers assign only when projects exist", () => {
    renderHeader();
    expect(screen.queryByTestId(RunDetailHeaderTestId.AssignProject)).not.toBeInTheDocument();
  });

  it("a project-less run with projects shows the assign control", () => {
    projectsRef.current = [{ id: "p1", name: "Alpha" }];
    renderHeader();
    expect(screen.getByTestId(RunDetailHeaderTestId.AssignProject)).toBeInTheDocument();
  });

  describe("source PR link", () => {
    const sourcePr = {
      kind: "rebase" as const,
      repo: "acme/api",
      number: 7,
      url: "https://github.com/acme/api/pull/7",
    };

    it("links to the in-app PR page", async () => {
      renderHeader({ sourcePr });
      const link = screen.getByTestId(RunDetailHeaderTestId.SourcePrLink);
      expect(link).toHaveTextContent("acme/api#7");
      expect(link).toHaveAccessibleName("Zdrojový PR acme/api#7");
      await userEvent.click(link);
      expect(push).toHaveBeenLastCalledWith(
        "/dashboard/inbox/pull-requests?pr=https%3A%2F%2Fgithub.com%2Facme%2Fapi%2Fpull%2F7",
      );
    });

    it("is also rendered in the compact (sheet) header", () => {
      renderHeader({ sourcePr }, true);
      expect(screen.getByTestId(RunDetailHeaderTestId.SourcePrLink)).toBeInTheDocument();
    });

    it("is absent without a source PR", () => {
      renderHeader();
      expect(screen.queryByTestId(RunDetailHeaderTestId.SourcePrLink)).not.toBeInTheDocument();
    });
  });
  describe("source issue link", () => {
    it("links to the in-app issue page of a roadmap release", async () => {
      renderHeader({ projectId: "p1", roadmapItemId: "jira-cz-524", roadmapItemLabel: "CZ-524" });
      const link = screen.getByTestId(RunDetailHeaderTestId.SourceIssueLink);
      expect(link).toHaveTextContent("CZ-524");
      expect(link).toHaveAccessibleName("Zdrojové issue CZ-524");
      await userEvent.click(link);
      expect(push).toHaveBeenLastCalledWith("/dashboard/inbox/issues/p1/jira-cz-524");
    });

    it("is absent without a roadmap item", () => {
      renderHeader({ projectId: "p1" });
      expect(screen.queryByTestId(RunDetailHeaderTestId.SourceIssueLink)).not.toBeInTheDocument();
    });
  });
});
