import type { Company, Project, ProjectBudgetStatus, TaskRun } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { LedgerBudgetsScreen, LedgerBudgetsScreenTestId } from "./LedgerBudgetsScreen";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    projectRows: [] as ProjectBudgetStatus[],
    companies: [] as Company[],
    projects: [] as Project[],
    runs: [] as TaskRun[],
  },
}));

vi.mock("../../projects/queries/useBudgetQuery", () => ({
  useBudgetQuery: () => ({
    data: { projects: hooks.projectRows },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../companies/queries", () => ({
  useCompaniesQuery: () => ({
    data: hooks.companies,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../projects/queries", () => ({
  useProjectsQuery: () => ({
    data: hooks.projects,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => ({
    runs: hooks.runs,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function projectRow(over: Partial<ProjectBudgetStatus> = {}): ProjectBudgetStatus {
  return {
    projectId: "p_1",
    name: "Website",
    daily: { used: 3, cap: 10 },
    weekly: { used: 5, cap: 40 },
    running: 0,
    queued: 0,
    held: 0,
    ...over,
  };
}

function run(over: Partial<TaskRun> = {}): TaskRun {
  return {
    runId: "r_1",
    kind: "agent",
    owner: "coder",
    status: "done",
    pct: 100,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
    ...over,
  } as TaskRun;
}

describe("LedgerBudgetsScreen (ZB-10)", () => {
  beforeEach(() => {
    hooks.projectRows = [];
    hooks.companies = [];
    hooks.projects = [];
    hooks.runs = [];
  });

  it("renders the global, company and project meters plus the department table", () => {
    hooks.projectRows = [projectRow({ projectId: "p_1", name: "Website" })];
    hooks.projects = [{ id: "p_1", name: "Website", companyId: "c_1" } as Project];
    hooks.companies = [{ id: "c_1", name: "Acme" } as Company];
    hooks.runs = [run({ department: "dev", costUsd: 4.5 })];

    render(<LedgerBudgetsScreen />);

    expect(screen.getByTestId(LedgerBudgetsScreenTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerBudgetsScreenTestId.GlobalGrid)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerBudgetsScreenTestId.CompanyGrid)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerBudgetsScreenTestId.ProjectGrid)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerBudgetsScreenTestId.DepartmentTable)).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("shows the empty states when there are no companies or projects", () => {
    hooks.projectRows = [];
    hooks.projects = [];
    hooks.companies = [];
    hooks.runs = [];

    render(<LedgerBudgetsScreen />);

    expect(screen.getByTestId(LedgerBudgetsScreenTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(LedgerBudgetsScreenTestId.CompanyGrid)).not.toBeInTheDocument();
    expect(screen.queryByTestId(LedgerBudgetsScreenTestId.ProjectGrid)).not.toBeInTheDocument();
  });
});
