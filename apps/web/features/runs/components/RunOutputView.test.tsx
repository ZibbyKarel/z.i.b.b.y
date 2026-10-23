import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { DiffstatListTestId, FileTreeListTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { RunOutputView, RunOutputViewTestId, runOutputKind } from "./RunOutputView";

vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: () => ({ data: undefined }),
}));
vi.mock("../queries/useTaskRunFilesQuery", () => ({
  useTaskRunFilesQuery: (_runId: string, enabled: boolean) => ({
    data: enabled
      ? {
          truncated: false,
          entries: [
            { path: "output", kind: "dir", size: 0, modifiedAt: "2026-10-20T10:00:00Z" },
            {
              path: "output/report.md",
              kind: "file",
              size: 2048,
              modifiedAt: "2026-10-20T10:00:00Z",
            },
          ],
        }
      : undefined,
  }),
}));

const base: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "done",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
};

const prRun: RunView = {
  ...base,
  prOutput: {
    url: "https://github.com/o/r/pull/42",
    additions: 5,
    deletions: 1,
    files: [
      { path: "src/a.ts", additions: 4, deletions: 1 },
      { path: "src/b.ts", additions: 1, deletions: 0 },
    ],
  },
};

describe("runOutputKind", () => {
  it.each<[string, Partial<RunView>, string]>([
    ["prOutput", { prOutput: prRun.prOutput }, "pr"],
    ["pending diffstat", { diffstat: { files: [], additions: 0, deletions: 0 } }, "pr"],
    ["outputArtifactName", { outputArtifactName: "report.md" }, "markdown"],
    ["nothing", {}, "folder"],
  ])("%s", (_, over, kind) => {
    expect(runOutputKind({ ...base, ...over })).toBe(kind);
  });
});

describe("RunOutputView", () => {
  it("a done PR run shows the PR number title and one diff row per file", async () => {
    const onContinueTask = vi.fn();
    render(<RunOutputView mode="done" onContinueTask={onContinueTask} run={prRun} />);
    expect(screen.getByTestId(RunOutputViewTestId.Title)).toHaveTextContent("Pull request #42");
    expect(screen.getByTestId(DiffstatListTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(`${DiffstatListTestId.Row}-src/a.ts`)).toBeInTheDocument();
    expect(screen.getByTestId(`${DiffstatListTestId.Row}-src/b.ts`)).toBeInTheDocument();
    expect(screen.queryByTestId(RunOutputViewTestId.Pending)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId(RunOutputViewTestId.ContinueTask));
    expect(onContinueTask).toHaveBeenCalledOnce();
  });

  it("OPEN PR opens the PR url in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RunOutputView mode="done" onContinueTask={vi.fn()} run={prRun} />);
    await userEvent.click(screen.getByTestId(RunOutputViewTestId.Open));
    expect(open).toHaveBeenCalledWith(prRun.prOutput?.url, "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("a running run shows the in-progress pending notice and no continue action", () => {
    render(
      <RunOutputView
        mode="running"
        onContinueTask={vi.fn()}
        run={{ ...base, status: "running" }}
      />,
    );
    expect(screen.getByTestId(RunOutputViewTestId.Pending)).toHaveTextContent(
      "Probíhá · částečný výstup z posledního checkpointu",
    );
    expect(screen.queryByTestId(RunOutputViewTestId.ContinueTask)).not.toBeInTheDocument();
  });

  it("a folder run lists the run folder and OPEN FOLDER calls back", async () => {
    const onOpenFolder = vi.fn();
    render(
      <RunOutputView
        mode="done"
        onContinueTask={vi.fn()}
        onOpenFolder={onOpenFolder}
        run={{ ...base, taskId: "task_7" }}
      />,
    );
    expect(screen.getByTestId(RunOutputViewTestId.Title)).toHaveTextContent("task_7/");
    expect(screen.getByTestId(`${FileTreeListTestId.Row}-output`)).toBeInTheDocument();
    expect(screen.getByTestId(`${FileTreeListTestId.Row}-output/report.md`)).toHaveTextContent(
      "2.0 KB",
    );
    await userEvent.click(screen.getByTestId(RunOutputViewTestId.Open));
    expect(onOpenFolder).toHaveBeenCalledOnce();
  });
});
