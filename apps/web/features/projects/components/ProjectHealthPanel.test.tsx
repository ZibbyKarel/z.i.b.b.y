import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ProjectHealthStatus } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectHealthPanel, ProjectHealthPanelTestId } from "./ProjectHealthPanel";

const HEALTH_CHECK = { url: "https://acme.test/health", intervalSec: 300 };

const status = (over: Partial<ProjectHealthStatus> = {}): ProjectHealthStatus => ({
  projectId: "acme",
  url: HEALTH_CHECK.url,
  state: "up",
  sinceAt: "2026-10-24T08:00:00.000Z",
  checkedAt: "2026-10-24T09:00:00.000Z",
  httpStatus: 200,
  latencyMs: 42,
  ...over,
});

let statuses: ProjectHealthStatus[] = [];
let analyzePending = false;
const analyzeMutate = vi.fn();
const checkMutate = vi.fn();

vi.mock("../../project-health/queries", () => ({
  useProjectHealthQuery: () => ({ data: statuses }),
}));

vi.mock("../../project-health/mutations", () => ({
  useAnalyzeProjectHealthMutation: () => ({ mutate: analyzeMutate, isPending: analyzePending }),
  useCheckProjectHealthMutation: () => ({ mutate: checkMutate, isPending: false }),
}));

describe("ProjectHealthPanel", () => {
  beforeEach(() => {
    statuses = [];
    analyzePending = false;
    analyzeMutate.mockReset();
    checkMutate.mockReset();
  });

  it("shows the explanatory empty state when no healthCheck is set", () => {
    render(<ProjectHealthPanel projectId="acme" />);
    expect(screen.getByTestId(ProjectHealthPanelTestId.Empty)).toHaveTextContent(
      "Nastav health URL a ZIBBY ji bude pravidelně kontrolovat.",
    );
    expect(screen.queryByTestId(ProjectHealthPanelTestId.Check)).not.toBeInTheDocument();
  });

  it("up: shows 'V pořádku' and no Analyze button", () => {
    statuses = [status()];
    render(<ProjectHealthPanel healthCheck={HEALTH_CHECK} projectId="acme" />);
    expect(screen.getByTestId(ProjectHealthPanelTestId.State)).toHaveTextContent("V pořádku");
    expect(screen.queryByTestId(ProjectHealthPanelTestId.Analyze)).not.toBeInTheDocument();
  });

  it("down: shows the error and Analyze mutates with the project id and an empty body", async () => {
    statuses = [status({ state: "down", httpStatus: 503, error: "HTTP 503" })];
    render(<ProjectHealthPanel healthCheck={HEALTH_CHECK} projectId="acme" />);
    expect(screen.getByTestId(ProjectHealthPanelTestId.State)).toHaveTextContent("Nedostupné");
    expect(screen.getByTestId(ProjectHealthPanelTestId.Root)).toHaveTextContent("HTTP 503");

    await userEvent.click(screen.getByTestId(ProjectHealthPanelTestId.Analyze));
    expect(analyzeMutate).toHaveBeenCalledWith(
      { params: { projectId: "acme" }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("links to the created task after a successful Analyze", async () => {
    statuses = [status({ state: "down", error: "HTTP 503" })];
    analyzeMutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({ status: 200, body: { taskId: "t1" } }),
    );
    render(<ProjectHealthPanel healthCheck={HEALTH_CHECK} projectId="acme" />);
    expect(screen.queryByTestId(ProjectHealthPanelTestId.AnalysisLink)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(ProjectHealthPanelTestId.Analyze));
    const link = screen.getByTestId(ProjectHealthPanelTestId.AnalysisLink);
    expect(link).toHaveTextContent("Analýza spuštěna");
    expect(link).toHaveAttribute("href", "/work/tasks/t1");
  });

  it("disables Analyze while the mutation is pending", () => {
    statuses = [status({ state: "down", error: "HTTP 503" })];
    analyzePending = true;
    render(<ProjectHealthPanel healthCheck={HEALTH_CHECK} projectId="acme" />);
    expect(screen.getByTestId(ProjectHealthPanelTestId.Analyze)).toBeDisabled();
  });

  it("Check now calls the check mutation", async () => {
    statuses = [status()];
    render(<ProjectHealthPanel healthCheck={HEALTH_CHECK} projectId="acme" />);
    await userEvent.click(screen.getByTestId(ProjectHealthPanelTestId.Check));
    expect(checkMutate).toHaveBeenCalledWith({ params: { projectId: "acme" }, body: {} });
  });
});
