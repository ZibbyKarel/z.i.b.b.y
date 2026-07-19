import type { Project, ProjectBudgetStatus, TaskRun, TaskRunStatus } from "@zibby/contracts";
import { IconTileTestId, StatTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { ProjectCard } from "./ProjectCard";

// The footer task stats read the same unified feed the runs screen does; stub it
// so the card gets a fixed set of runs across two projects.
let feed: TaskRun[] = [];
vi.mock("../../runs", () => ({
  useRunsQuery: () => ({ runs: feed }),
}));

let seq = 0;
function taskRun(projectId: string | undefined, statusValue: TaskRunStatus): TaskRun {
  return {
    runId: `${projectId ?? "none"}-${statusValue}-${seq++}`,
    kind: "agent",
    owner: "",
    status: statusValue,
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: "2026-07-05T00:00:00.000Z",
    ...(projectId ? { projectId } : {}),
  } as TaskRun;
}

beforeEach(() => {
  feed = [];
});

const project = (over: Partial<Project> = {}): Project => ({
  id: "alpha",
  name: "Alpha",
  path: "~/Projects/alpha",
  ...over,
});

const status = (over: Partial<ProjectBudgetStatus> = {}): ProjectBudgetStatus => ({
  projectId: "alpha",
  name: "Alpha",
  daily: { used: 1, cap: 2 },
  weekly: { used: 1 },
  running: 1,
  queued: 0,
  held: 0,
  ...over,
});

describe("ProjectCard budget", () => {
  it("shows the daily run-count bar with used/cap when a budget is set", () => {
    render(<ProjectCard budget={status()} project={project({ budget: { dailyRuns: 2 } })} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("hides budget bars entirely when the project has no budget", () => {
    render(<ProjectCard budget={undefined} project={project()} />);
    expect(screen.queryByText(/\/2$/)).not.toBeInTheDocument();
  });

  it("surfaces a held count when the engagement has tasks held over budget", () => {
    render(
      <ProjectCard budget={status({ held: 2 })} project={project({ budget: { dailyRuns: 1 } })} />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("ProjectCard cost bars (Phase 12)", () => {
  it("shows the daily cost bar with spent/cap when a dollar cap is set", () => {
    render(
      <ProjectCard
        budget={status({ dailyCost: { spentUsd: 1.5, capUsd: 5 } })}
        project={project({ budget: { dailyCostCapUsd: 5 } })}
      />,
    );
    expect(screen.getByText("$1.50 / $5.00")).toBeInTheDocument();
  });

  it("hides a cost bar when its window has no dollar cap set (even with spend > 0)", () => {
    render(
      <ProjectCard
        budget={status({ dailyCost: { spentUsd: 1.5 } })}
        project={project({ budget: { dailyRuns: 2 } })}
      />,
    );
    expect(screen.queryByText(/\$1\.50/)).not.toBeInTheDocument();
  });

  it("hides all cost bars entirely when the project has no budget", () => {
    render(<ProjectCard budget={undefined} project={project()} />);
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

function statValue(key: string): string {
  const link = screen.getByTestId(`project-card-stat-${key}`);
  return within(link).getByTestId(StatTestId.Value).textContent ?? "";
}

describe("ProjectCard task stats (Phase 52)", () => {
  it("shows the per-status task counts (bucketed) but no 'Celkem' total", () => {
    feed = [
      taskRun("alpha", "running"),
      taskRun("alpha", "done"),
      taskRun("alpha", "done"),
      taskRun("alpha", "queued"), // → waiting bucket
      taskRun("alpha", "awaiting-approval"), // → waiting bucket
      taskRun("beta", "error"), // other project — excluded
    ];
    render(<ProjectCard project={project()} />);

    expect(statValue("running")).toBe("1");
    expect(statValue("waiting")).toBe("2");
    expect(statValue("done")).toBe("2");
    expect(statValue("error")).toBe("0");
    expect(statValue("parked")).toBe("0");
    // The detail's "Celkem" total is intentionally excluded from the card.
    expect(screen.queryByTestId("project-card-stat-total")).toBeNull();
  });

  it("deep-links each stat into /archiv pre-filtered to this project and the bucket's states (F8d — /runs is deleted; /archiv doesn't yet read these params, a pre-existing F2 gap)", () => {
    feed = [taskRun("alpha", "done")];
    render(<ProjectCard project={project()} />);

    expect(screen.getByTestId("project-card-stat-done")).toHaveAttribute(
      "href",
      "/archiv?project=alpha&filter=done",
    );
    expect(screen.getByTestId("project-card-stat-waiting")).toHaveAttribute(
      "href",
      "/archiv?project=alpha&filter=queued,scheduled,pending,held,awaiting-approval",
    );
  });
});

describe("ProjectCard logo", () => {
  it("renders the project's custom logo when set", () => {
    render(<ProjectCard project={project({ logo: "data:image/png;base64,AAA" })} />);
    const img = screen.getByTestId(IconTileTestId.Image);
    expect(img).toHaveAccessibleName("Alpha");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
  });

  it("falls back to the code glyph when the project has no logo", () => {
    render(<ProjectCard project={project()} />);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
  });
});
