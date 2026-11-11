import { IconTestId, ProgressTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { RunsWidget, RunsWidgetTestId } from "./RunsWidget";

const d = vi.hoisted(() => ({
  live: [] as unknown[],
  archived: [] as unknown[],
  liveAt: 0,
  archivedAt: 0,
}));

vi.mock("../../runs/components/TasksDockPanel", () => ({
  useLiveRunsSnapshot: () => ({ runs: d.live, updatedAt: d.liveAt }),
  useInvalidateOnTerminalRun: () => undefined,
}));
vi.mock("../../runs/queries/useRecentArchivedRunsQuery", () => ({
  useRecentArchivedRunsQuery: () => ({
    data: d.archived,
    isPending: false,
    dataUpdatedAt: d.archivedAt,
  }),
}));
vi.mock("../../workflows", () => ({ useWorkflowsQuery: () => ({ data: [] }) }));

const widget: BridgeWidget = { id: "w-r", type: "runs", x: 0, y: 0, w: 4, h: 8 };
const props: BridgeWidgetProps = {
  widget,
  adding: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
};
const run = (runId: string, status: string) => ({
  runId,
  status,
  kind: "task",
  owner: "wf",
  project: "p",
  title: runId,
  startedAt: "2026-10-27T10:00:00Z",
});
const key = (runId: string) => `${widget.id}:${runId}`;

beforeEach(() => {
  d.live = [run("a", "running"), run("b", "awaiting-approval")];
  d.archived = [run("c", "error"), run("d", "done")];
  d.liveAt = 0;
  d.archivedAt = 0;
});

describe("RunsWidget", () => {
  it("shows a progress bar only for the running run and state icons for the rest", () => {
    renderWithProviders(<RunsWidget {...props} />);
    expect(screen.getAllByTestId(new RegExp(`^${RunsWidgetTestId.Progress}-`))).toHaveLength(1);
    expect(screen.getAllByTestId(new RegExp(`^${RunsWidgetTestId.StateIcon}-`))).toHaveLength(3);
    const bar = screen.getByTestId(`${RunsWidgetTestId.Progress}-${key("a")}`);
    expect(within(bar).getByTestId(ProgressTestId.Root)).toBeInTheDocument();
    for (const id of ["b", "c", "d"])
      expect(screen.queryByTestId(`${RunsWidgetTestId.Progress}-${key(id)}`)).toBeNull();
  });

  it("shows only the elapsed time under a running bar without phases (no phase count)", () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-27T10:03:12Z"), toFake: ["Date"] });
    try {
      renderWithProviders(<RunsWidget {...props} />);
      const meta = screen.getByTestId(`${RunsWidgetTestId.Meta}-${key("a")}`);
      expect(meta).toHaveTextContent("3m 12s");
      expect(meta).not.toHaveTextContent(/phase|fáz/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tints the icon by outcome", () => {
    renderWithProviders(<RunsWidget {...props} />);
    const icon = (id: string) =>
      within(screen.getByTestId(`${RunsWidgetTestId.StateIcon}-${key(id)}`)).getByTestId(
        IconTestId.Root,
      );
    expect(icon("c")).toHaveClass("text-bad");
    expect(icon("d")).toHaveClass("text-ok");
    expect(icon("b")).toHaveClass("text-warn");
  });

  // todo-16: the live feed and the archive are fetched at different moments, so one run can sit
  // in both. The fresher snapshot decides which row shows; a tie goes to the archive.
  describe("a run in both the live feed and the archive (todo-16)", () => {
    const rows = () =>
      screen.getAllByTestId(new RegExp(`^${RunsWidgetTestId.StateIcon}-${key("x")}$`));

    it("a fresher archive (done) drops the stale live 'waiting for you' row", () => {
      d.live = [run("x", "awaiting-approval")];
      d.archived = [run("x", "done")];
      d.liveAt = 1_000;
      d.archivedAt = 2_000;
      renderWithProviders(<RunsWidget {...props} />);
      expect(rows()).toHaveLength(1);
      expect(within(rows()[0]!).getByTestId(IconTestId.Root)).toHaveClass("text-ok");
    });

    it("a fresher live feed keeps a real pending gate over a stale archived 'done'", () => {
      // The gate stamp lands after the run's `done`: the archive caught `done` first.
      d.live = [run("x", "awaiting-approval")];
      d.archived = [run("x", "done")];
      d.liveAt = 2_000;
      d.archivedAt = 1_000;
      renderWithProviders(<RunsWidget {...props} />);
      expect(rows()).toHaveLength(1);
      expect(within(rows()[0]!).getByTestId(IconTestId.Root)).toHaveClass("text-warn");
    });

    it("on a tie the archive wins", () => {
      d.live = [run("x", "awaiting-approval")];
      d.archived = [run("x", "done")];
      d.liveAt = 1_000;
      d.archivedAt = 1_000;
      renderWithProviders(<RunsWidget {...props} />);
      expect(rows()).toHaveLength(1);
      expect(within(rows()[0]!).getByTestId(IconTestId.Root)).toHaveClass("text-ok");
    });
  });
});
