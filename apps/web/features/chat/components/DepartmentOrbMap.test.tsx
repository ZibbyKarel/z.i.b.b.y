import { type Agent, DEPARTMENTS, type DepartmentWithStatus } from "@zibby/contracts";
import {
  CoreOrbTestId,
  DEFAULT_DURATION_MS,
  HandoffFlareTestId,
  OrbMapTestId,
  OrbNodeTestId,
  OrbitFieldTestId,
  RETIRE_BUFFER_MS,
} from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pipeline } from "../../../domain";
import { installEventSourceMock } from "../../../test/eventSourceMock";
import { RunEventsProvider } from "../../runs/runEvents";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen, within } from "../../../test/render";
import { DepartmentOrbMap, DepartmentOrbMapTestId } from "./DepartmentOrbMap";

// The provider reads `API_URL` off the env; pin it so its `EventSource` opens
// (mirrors `ChatScreen.test.tsx`'s own pattern for the same reason).
vi.mock("../../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/api")>();
  return { ...actual, API_URL: "http://localhost:3333" };
});

function department(overrides: Partial<DepartmentWithStatus> = {}): DepartmentWithStatus {
  const base = DEPARTMENTS[0]!;
  return {
    id: base.id,
    code: base.code,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    ...overrides,
  };
}

/** All 8 registry departments, each `idle` by default, some overridable by id. */
function allDepartments(
  overrides: Record<string, Partial<DepartmentWithStatus>> = {},
): DepartmentWithStatus[] {
  return DEPARTMENTS.map((s) =>
    department({ id: s.id, name: s.name, color: s.color, ...(overrides[s.id] ?? {}) }),
  );
}

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: "delivery",
    name: "Delivery",
    lastRun: "—",
    lastState: "done",
    desc: "",
    file: "~/zibby/pipelines/delivery.pipeline.md",
    phases: [],
    outputs: [],
    ...overrides,
  };
}

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "delivery_1",
    kind: "pipeline",
    owner: "delivery",
    processor: { kind: "pipeline", id: "delivery", name: "Delivery" },
    status: "running",
    prompt: "",
    startedAt: "2026-07-08T00:00:00.000Z",
    ...overrides,
  } as RunView;
}

describe("DepartmentOrbMap", () => {
  it("renders the root and all 8 registry nodes", () => {
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments()}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    expect(screen.getByTestId(DepartmentOrbMapTestId.Root)).toBeInTheDocument();
    for (const s of DEPARTMENTS) {
      expect(screen.getByTestId(`${OrbMapTestId.Node}-${s.id}`)).toBeInTheDocument();
    }
  });

  it("clicking a node fires onSelectDepartment with its id", async () => {
    const user = userEvent.setup();
    const onSelectDepartment = vi.fn();
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments()}
        onOpenCore={vi.fn()}
        onSelectDepartment={onSelectDepartment}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-ops`);
    await user.click(within(wrapper).getByTestId(OrbNodeTestId.Root));
    expect(onSelectDepartment).toHaveBeenCalledWith("ops");
  });

  it("clicking the core fires onOpenCore", async () => {
    const user = userEvent.setup();
    const onOpenCore = vi.fn();
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments()}
        onOpenCore={onOpenCore}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    const coreWrapper = screen.getByTestId(OrbMapTestId.Core);
    await user.click(within(coreWrapper).getByTestId(CoreOrbTestId.Root));
    expect(onOpenCore).toHaveBeenCalledTimes(1);
  });

  it("falls back to idle for a department missing from the roster", () => {
    // Drop `qa` from the roster entirely — the node still renders (fixed
    // registry order) and falls back to `idle`/0 rather than throwing.
    const departments = allDepartments().filter((s) => s.id !== "qa");
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={departments}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-qa`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName(
      "QA & Architecture, V klidu",
    );
  });

  it("wires each node's accessible name to name + localized state via departments.nodeAria", () => {
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments({ dev: { state: "running" } })}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-dev`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName(
      "Development, Běží",
    );
  });

  it("an owned failed run reads as the error state (red incident halo)", () => {
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments({ sec: { state: "error", errorCount: 1 } })}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={[]}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-sec`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Security, Chyba");
    expect(within(wrapper).getByTestId(OrbNodeTestId.Halo)).toHaveStyle({
      border: "1.5px solid #ff6b6b",
    });
  });

  it("derives a node's activeCount from active runs owned by its pipeline", () => {
    const pipelines = [pipeline({ id: "dev-a", department: "dev" })];
    const runs = [
      run({ runId: "r1", owner: "dev-a", status: "running" }),
      run({ runId: "r2", owner: "dev-a", status: "queued" }),
    ];
    renderWithProviders(
      <DepartmentOrbMap
        agents={[]}
        departments={allDepartments()}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={pipelines}
        runs={runs}
        thinking={false}
      />,
    );

    // One `OrbitField` dot per active task — the node's own `OrbitField` instance
    // renders exactly the 2 active runs above as orbiting dots.
    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-dev`);
    expect(within(wrapper).getAllByTestId(OrbitFieldTestId.Dot)).toHaveLength(2);
  });

  it("an agent-kind running run whose agent has department renders one OrbitField dot", () => {
    const agents = [{ id: "koder", name: "Kodér", instructions: "x", department: "dev" } as Agent];
    const runs = [run({ runId: "r1", kind: "agent", owner: "koder", status: "running" })];
    renderWithProviders(
      <DepartmentOrbMap
        agents={agents}
        departments={allDepartments()}
        onOpenCore={vi.fn()}
        onSelectDepartment={vi.fn()}
        pipelines={[]}
        runs={runs}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-dev`);
    expect(within(wrapper).getAllByTestId(OrbitFieldTestId.Dot)).toHaveLength(1);
  });

  describe("run-event handoff flares (Task 13b)", () => {
    let mock: ReturnType<typeof installEventSourceMock>;

    beforeEach(() => {
      mock = installEventSourceMock();
    });

    afterEach(() => {
      mock.restore();
      vi.useRealTimers();
    });

    /** Mounts `DepartmentOrbMap` under a real `RunEventsProvider` so a mocked SSE
     * frame reaches the adapter's own `onRunEvent` subscription — exactly the bus
     * `ChatScreen`'s real tree provides at `apps/web/app/providers.tsx`. */
    function renderUnderBus(pipelines: Pipeline[], runs: RunView[]) {
      renderWithProviders(
        <RunEventsProvider>
          <DepartmentOrbMap
            agents={[]}
            departments={allDepartments()}
            onOpenCore={vi.fn()}
            onSelectDepartment={vi.fn()}
            pipelines={pipelines}
            runs={runs}
            thinking={false}
          />
        </RunEventsProvider>,
      );
    }

    it("a dispatch run-event (pipeline-runs → running) appends a flare from the core to the owning department", () => {
      const pipelines = [pipeline({ id: "dev-a", department: "dev" })];
      const runs = [run({ runId: "r1", owner: "dev-a", status: "running" })];
      renderUnderBus(pipelines, runs);

      expect(screen.queryByTestId(HandoffFlareTestId.Root)).toBeNull();
      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "r1", status: "running" });
      });
      expect(screen.getByTestId(HandoffFlareTestId.Root)).toBeInTheDocument();
    });

    it("an unattributable run-event (unresolvable owner) fires no flare", () => {
      renderUnderBus([], []);
      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "unknown-run", status: "running" });
      });
      expect(screen.queryByTestId(HandoffFlareTestId.Root)).toBeNull();
    });

    it("onFlareDone prunes the flare once its comet lifetime ends", () => {
      vi.useFakeTimers();
      const pipelines = [pipeline({ id: "dev-a", department: "dev" })];
      const runs = [run({ runId: "r1", owner: "dev-a", status: "running" })];
      renderUnderBus(pipelines, runs);

      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "r1", status: "running" });
      });
      expect(screen.getByTestId(HandoffFlareTestId.Root)).toBeInTheDocument();

      // `HandoffFlare`'s own self-retire timer — advancing past it fires `onDone`
      // → `OrbMap`'s `onFlareDone` → the adapter drops the flare from its own
      // state.
      act(() => {
        vi.advanceTimersByTime(DEFAULT_DURATION_MS + RETIRE_BUFFER_MS);
      });
      expect(screen.queryByTestId(HandoffFlareTestId.Root)).toBeNull();
    });
  });
});
