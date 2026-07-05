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

  it("deep-links each tile into /runs pre-filtered to the project (and the bucket's states)", () => {
    feed = [run("alpha", "done")];
    render(<ProjectRunSummary projectId="alpha" />);

    expect(screen.getByTestId("project-run-summary-total")).toHaveAttribute(
      "href",
      "/runs?project=alpha",
    );
    expect(screen.getByTestId("project-run-summary-done")).toHaveAttribute(
      "href",
      "/runs?project=alpha&filter=done",
    );
    expect(screen.getByTestId("project-run-summary-waiting")).toHaveAttribute(
      "href",
      "/runs?project=alpha&filter=queued,scheduled,pending,held,awaiting-approval",
    );
  });
});
