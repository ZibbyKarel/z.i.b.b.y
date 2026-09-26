import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { RunView } from "../run";
import { ActivityRunDetailScreen } from "./ActivityRunDetailScreen";

vi.mock("../components/RunDetail", () => ({
  RunDetail: ({ run }: { run: RunView }) => <div data-testid="run-detail">{run.runId}</div>,
}));
vi.mock("../queries/useRunsQuery", () => ({
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
}));
vi.mock("../useRunActions", () => ({
  useRunActions: () => ({
    stop: vi.fn(),
    stopping: false,
    resume: vi.fn(),
    resuming: false,
    remove: vi.fn(),
    deleting: false,
  }),
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    run: undefined as RunView | undefined,
    isPending: false,
    isError: false,
  },
}));
vi.mock("../queries/useTaskRunQuery", () => ({
  useTaskRunQuery: () => ({
    data: hooks.run,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch: vi.fn(),
  }),
}));

describe("ActivityRunDetailScreen (ZB-07)", () => {
  it("renders the resolved run in RunDetail", () => {
    hooks.run = { runId: "r_1" } as RunView;
    hooks.isPending = false;
    hooks.isError = false;
    render(<ActivityRunDetailScreen runId="r_1" />);
    expect(screen.getByTestId("run-detail")).toHaveTextContent("r_1");
  });

  it("shows a loading state while the run resolves", () => {
    hooks.run = undefined;
    hooks.isPending = true;
    hooks.isError = false;
    render(<ActivityRunDetailScreen runId="r_1" />);
    expect(screen.queryByTestId("run-detail")).toBeNull();
  });
});
