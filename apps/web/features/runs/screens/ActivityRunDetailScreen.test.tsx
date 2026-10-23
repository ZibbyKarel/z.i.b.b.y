import { EmptyStateTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { RunView } from "../run";
import { ActivityRunDetailScreen } from "./ActivityRunDetailScreen";

vi.mock("../components/RunDetail", () => ({
  RunDetail: ({ run }: { run: RunView }) => <div data-testid="run-detail">{run.runId}</div>,
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    run: undefined as RunView | undefined,
    isPending: false,
    isError: false,
    error: null as { status: number } | null,
  },
}));
vi.mock("../queries/useTaskRunQuery", () => ({
  useTaskRunQuery: () => ({
    data: hooks.run,
    isPending: hooks.isPending,
    isError: hooks.isError,
    error: hooks.error,
    refetch: vi.fn(),
  }),
}));

function setHooks(over: Partial<typeof hooks>) {
  Object.assign(hooks, { run: undefined, isPending: false, isError: false, error: null }, over);
}

describe("ActivityRunDetailScreen", () => {
  it("renders the resolved run in RunDetail", () => {
    setHooks({ run: { runId: "r_1" } as RunView });
    render(<ActivityRunDetailScreen runId="r_1" />);
    expect(screen.getByTestId("run-detail")).toHaveTextContent("r_1");
  });

  it("shows a loading state while the run resolves", () => {
    setHooks({ isPending: true });
    render(<ActivityRunDetailScreen runId="r_1" />);
    expect(screen.queryByTestId("run-detail")).toBeNull();
  });

  it("a 404 renders the not-found empty state naming the id", () => {
    setHooks({ isError: true, error: { status: 404 } });
    render(<ActivityRunDetailScreen runId="r_gone" />);
    const empty = screen.getByTestId(EmptyStateTestId.Root);
    expect(empty).toHaveTextContent("Běh nenalezen");
    expect(empty).toHaveTextContent("r_gone");
  });
});
