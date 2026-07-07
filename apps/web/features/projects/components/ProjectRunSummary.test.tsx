import type { TaskRun, TaskRunStatus } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { StatTestId } from "@zibby/design-system";
import { ProjectRunSummary } from "./ProjectRunSummary";

// The summary reads the same unified feed the runs screen does; stub it so the
// component gets a fixed set of runs across two projects.
let feed: TaskRun[] = [];
vi.mock("../../runs", () => ({
  useRunsQuery: () => ({ runs: feed }),
}));

// Phase 24: the runs feed reads its scope from the top-bar's active-project
// context, not a `?project=` query — assert each tile arms that scope on click.
const setActiveProject = vi.fn();
vi.mock("../context/ProjectProvider", () => ({
  useActiveProject: () => ({ activeProjectId: null, setActiveProject }),
}));

let seq = 0;
function run(projectId: string | undefined, status: TaskRunStatus): TaskRun {
  return {
    runId: `${projectId ?? "none"}-${status}-${seq++}`,
    kind: "agent",
    owner: "",
    status,
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: "2026-07-05T00:00:00.000Z",
    ...(projectId ? { projectId } : {}),
  } as TaskRun;
}

function tileValue(key: string): string {
  const link = screen.getByTestId(`project-run-summary-${key}`);
  return within(link).getByTestId(StatTestId.Value).textContent ?? "";
}

describe("ProjectRunSummary", () => {
  it("counts only this project's runs, bucketed by status group", () => {
    feed = [
      run("alpha", "running"),
      run("alpha", "done"),
      run("alpha", "done"),
      run("alpha", "queued"), // → waiting bucket
      run("alpha", "awaiting-approval"), // → waiting bucket
      run("beta", "error"), // other project — excluded everywhere
    ];
    render(<ProjectRunSummary projectId="alpha" />);

    expect(tileValue("total")).toBe("5");
    expect(tileValue("running")).toBe("1");
    expect(tileValue("waiting")).toBe("2");
    expect(tileValue("done")).toBe("2");
    expect(tileValue("error")).toBe("0");
    expect(tileValue("parked")).toBe("0");
  });

  it("deep-links each tile into /runs pre-filtered to the bucket's states (project scope comes from the click)", () => {
    feed = [run("alpha", "done")];
    render(<ProjectRunSummary projectId="alpha" />);

    expect(screen.getByTestId("project-run-summary-total")).toHaveAttribute("href", "/runs");
    expect(screen.getByTestId("project-run-summary-done")).toHaveAttribute(
      "href",
      "/runs?filter=done",
    );
    expect(screen.getByTestId("project-run-summary-waiting")).toHaveAttribute(
      "href",
      "/runs?filter=queued,scheduled,pending,held,awaiting-approval",
    );
  });

  it("arms the top-bar project scope before navigating to the runs feed", () => {
    feed = [run("alpha", "done")];
    setActiveProject.mockClear();
    render(<ProjectRunSummary projectId="alpha" />);

    screen.getByTestId("project-run-summary-total").click();
    expect(setActiveProject).toHaveBeenCalledWith("alpha");

    setActiveProject.mockClear();
    screen.getByTestId("project-run-summary-done").click();
    expect(setActiveProject).toHaveBeenCalledWith("alpha");
  });
});
