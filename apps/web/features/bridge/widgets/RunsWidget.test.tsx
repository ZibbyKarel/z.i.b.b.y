import { IconTestId, ProgressTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { RunsWidget, RunsWidgetTestId } from "./RunsWidget";

const d = vi.hoisted(() => ({ live: [] as unknown[], archived: [] as unknown[] }));

vi.mock("../../runs/components/TasksDockPanel", () => ({
  useLiveRuns: () => d.live,
  useInvalidateOnTerminalRun: () => undefined,
}));
vi.mock("../../runs/queries/useRecentArchivedRunsQuery", () => ({
  useRecentArchivedRunsQuery: () => ({ data: d.archived, isPending: false }),
}));
vi.mock("../../workflows", () => ({ useWorkflowsQuery: () => ({ data: [] }) }));

const widget: BridgeWidget = { id: "w-r", type: "runs", x: 0, y: 0, w: 4, h: 8 };
const props: BridgeWidgetProps = {
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
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
});
