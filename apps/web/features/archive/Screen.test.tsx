import { fireEvent } from "@testing-library/react";
import { ButtonGroupTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../test/render";
import type { RunView } from "../runs/run";
import { ArchiveSubsystemFilterTestId } from "./components/ArchiveSubsystemFilter";
import { Screen } from "./Screen";

/**
 * F2 (`docs/plans/hud2chat-F2-archive.md`): the `/archiv` page's own Screen-level
 * wiring — grouping mode, search, the subsystem multi-select, `?run=` deep-link
 * selection, and the honest empty states. `ArchiveRow`/`ArchiveSubsystemFilter`
 * are exercised for real (each already has its own focused unit suite); only
 * `RunDetail` — a heavy, already-tested composite — is stubbed, mirroring the
 * runs `Screen.test.tsx`'s own `vi.mock("./components/RunDetail", …)`.
 *
 * A group's heading renders as one text node (`{heading} · {count}`) and every
 * row's subline also reads `{subsystem} · {project}` — both can contain the
 * same substring (e.g. "Forge"), so assertions below match on the full run
 * TITLE (always a distinct, single-expression text node) rather than on
 * fragments of the heading/subline, to avoid ambiguous-match false negatives.
 */
const { searchParams } = vi.hoisted(() => ({
  searchParams: { value: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    runs: [] as RunView[],
    isPending: false,
    isError: false,
    pipelines: [] as { id: string; ownerSubsystem?: string }[],
    chains: [] as { id: string; ownerSubsystem?: string }[],
  },
}));
const refetch = vi.fn();
vi.mock("../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => ({
    runs: hooks.runs,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch,
  }),
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
}));
vi.mock("../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));
vi.mock("../chains", () => ({ useChainsQuery: () => ({ data: hooks.chains }) }));

vi.mock("../runs/mutations", () => ({
  useStopTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePipelineRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../tasks", () => ({
  useCancelScheduledTaskMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../runs/components/RunDetail", () => ({
  RunDetail: ({ run }: { run: RunView }) => <div data-testid={`run-detail-${run.runId}`} />,
}));

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "pipeline",
    owner: "delivery",
    status: "done",
    pct: null,
    title: "Ship the release",
    prompt: "",
    project: "billing-svc",
    startedAt: "2020-01-01T08:00:00.000Z",
    logBase: null,
    ...overrides,
  };
}

describe("Archive Screen (F2)", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    hooks.runs = [];
    hooks.isPending = false;
    hooks.isError = false;
    hooks.pipelines = [{ id: "delivery", ownerSubsystem: "forge" }];
    hooks.chains = [{ id: "forge-chain", ownerSubsystem: "forge" }];
    refetch.mockClear();
  });

  it("groups archived runs by subsystem by default, with agent/goal runs under 'Bez subsystému'", () => {
    hooks.runs = [
      run({ runId: "run-forge", owner: "delivery", status: "done", title: "Forge task" }),
      run({
        runId: "run-agent",
        kind: "agent",
        owner: "writer",
        status: "done",
        title: "Agent task",
      }),
    ];
    render(<Screen />);

    expect(screen.getByText("Forge task")).toBeInTheDocument();
    expect(screen.getByText("Agent task")).toBeInTheDocument();
    // The "bez subsystému" bucket is explicit, never hidden (D8) — its heading
    // (and the agent row's own subline) both surface the same label.
    expect(screen.getAllByText(/Bez subsystému/).length).toBeGreaterThan(0);
  });

  it("excludes paused-limit runs (D9 — a mid-run pause, not an archived state)", () => {
    hooks.runs = [
      run({ runId: "run-done", status: "done", title: "Finished task" }),
      run({ runId: "run-paused", status: "paused-limit", title: "Still-running task" }),
    ];
    render(<Screen />);

    expect(screen.getByText("Finished task")).toBeInTheDocument();
    expect(screen.queryByText("Still-running task")).not.toBeInTheDocument();
  });

  it("switches to time-bucket grouping via the group-mode toggle", () => {
    hooks.runs = [
      run({ runId: "run-today", title: "Forge task", startedAt: new Date().toISOString() }),
    ];
    render(<Screen />);

    expect(screen.queryByText(/Dnes/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-time`));

    expect(screen.getAllByText(/Dnes/).length).toBeGreaterThan(0);
    expect(screen.getByText("Forge task")).toBeInTheDocument();
  });

  it("filters the list by free-text search over title and project", () => {
    hooks.runs = [
      run({ runId: "run-a", title: "Ship the release", project: "billing-svc" }),
      run({ runId: "run-b", title: "Rotate secrets", project: "auth-svc" }),
    ];
    render(<Screen />);

    expect(screen.getByText("Ship the release")).toBeInTheDocument();
    expect(screen.getByText("Rotate secrets")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Hledat v archivu"), {
      target: { value: "billing" },
    });

    expect(screen.getByText("Ship the release")).toBeInTheDocument();
    expect(screen.queryByText("Rotate secrets")).not.toBeInTheDocument();
  });

  it("filters the list via the subsystem multi-select", () => {
    hooks.pipelines = [
      { id: "delivery", ownerSubsystem: "forge" },
      { id: "other", ownerSubsystem: "loom" },
    ];
    hooks.runs = [
      run({ runId: "run-forge", owner: "delivery", title: "Forge task" }),
      run({ runId: "run-loom", owner: "other", title: "Loom task" }),
    ];
    render(<Screen />);

    expect(screen.getByText("Forge task")).toBeInTheDocument();
    expect(screen.getByText("Loom task")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    const options = screen.getAllByTestId(ArchiveSubsystemFilterTestId.Option);
    const forgeOption = options.find((el) => el.getAttribute("data-subsystem-id") === "forge");
    expect(forgeOption).toBeDefined();
    fireEvent.click(within(forgeOption!).getByText("Forge"));

    expect(screen.getByText("Forge task")).toBeInTheDocument();
    expect(screen.queryByText("Loom task")).not.toBeInTheDocument();
  });

  it("selects the run named by ?run= and renders its detail", () => {
    searchParams.value = new URLSearchParams("run=run-b");
    hooks.runs = [
      run({ runId: "run-a", title: "Ship the release" }),
      run({ runId: "run-b", title: "Rotate secrets" }),
    ];
    render(<Screen />);

    expect(screen.getByTestId("run-detail-run-b")).toBeInTheDocument();
  });

  it("clicking a row selects it and swaps the detail pane", () => {
    hooks.runs = [
      run({ runId: "run-a", title: "Ship the release" }),
      run({ runId: "run-b", title: "Rotate secrets" }),
    ];
    render(<Screen />);

    expect(screen.getByTestId("run-detail-run-a")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Rotate secrets"));

    expect(screen.getByTestId("run-detail-run-b")).toBeInTheDocument();
    expect(screen.queryByTestId("run-detail-run-a")).not.toBeInTheDocument();
  });

  it("shows the select hint (no run selected) when the archive is empty", () => {
    hooks.runs = [];
    render(<Screen />);

    expect(screen.getByText("Archiv je zatím prázdný")).toBeInTheDocument();
    expect(screen.getByText("Vyber úlohu vlevo pro zobrazení detailu.")).toBeInTheDocument();
  });

  it("shows the filtered-empty message when search matches nothing, without an empty-archive message", () => {
    hooks.runs = [run({ runId: "run-a", title: "Ship the release" })];
    render(<Screen />);

    fireEvent.change(screen.getByLabelText("Hledat v archivu"), {
      target: { value: "nothing-matches-this" },
    });

    expect(screen.getByText("Nic nenalezeno.")).toBeInTheDocument();
    expect(screen.queryByText("Archiv je zatím prázdný")).not.toBeInTheDocument();
  });

  it("shows the loading state while the feed is pending", () => {
    hooks.isPending = true;
    render(<Screen />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
  });

  it("shows the error state (with retry) when the feed fails", () => {
    hooks.isError = true;
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetch).toHaveBeenCalled();
  });
});
