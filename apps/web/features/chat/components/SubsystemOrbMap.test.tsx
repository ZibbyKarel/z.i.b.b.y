import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
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
import { SubsystemOrbMap, SubsystemOrbMapTestId } from "./SubsystemOrbMap";

// The provider reads `API_URL` off the env; pin it so its `EventSource` opens
// (mirrors `ChatScreen.test.tsx`'s own pattern for the same reason).
vi.mock("../../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/api")>();
  return { ...actual, API_URL: "http://localhost:3333" };
});

function subsystem(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
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

/** All 8 registry subsystems, each `idle` by default, some overridable by id. */
function allSubsystems(
  overrides: Record<string, Partial<SubsystemWithStatus>> = {},
): SubsystemWithStatus[] {
  return SUBSYSTEMS.map((s) =>
    subsystem({ id: s.id, name: s.name, color: s.color, ...(overrides[s.id] ?? {}) }),
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

describe("SubsystemOrbMap", () => {
  it("renders the root and all 8 registry nodes", () => {
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems()}
        thinking={false}
      />,
    );

    expect(screen.getByTestId(SubsystemOrbMapTestId.Root)).toBeInTheDocument();
    for (const s of SUBSYSTEMS) {
      expect(screen.getByTestId(`${OrbMapTestId.Node}-${s.id}`)).toBeInTheDocument();
    }
  });

  it("clicking a node fires onSelectSubsystem with its id", async () => {
    const user = userEvent.setup();
    const onSelectSubsystem = vi.fn();
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={onSelectSubsystem}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems()}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-puls`);
    await user.click(within(wrapper).getByTestId(OrbNodeTestId.Root));
    expect(onSelectSubsystem).toHaveBeenCalledWith("puls");
  });

  it("clicking the core fires onOpenCore", async () => {
    const user = userEvent.setup();
    const onOpenCore = vi.fn();
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={onOpenCore}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems()}
        thinking={false}
      />,
    );

    const coreWrapper = screen.getByTestId(OrbMapTestId.Core);
    await user.click(within(coreWrapper).getByTestId(CoreOrbTestId.Root));
    expect(onOpenCore).toHaveBeenCalledTimes(1);
  });

  it("maps a running subsystem to the localized working status label", () => {
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems({ forge: { state: "running" } })}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-forge`);
    // Default test locale is `cs` (see `renderWithProviders`) — `running` renders
    // as the `subsystems.state.running` catalog value, reused from
    // `SubsystemOrbsOverlay`/`SubsystemDrawer` rather than a new key.
    expect(within(wrapper).getByTestId(OrbNodeTestId.Status)).toHaveTextContent("Běží");
  });

  it("maps report/waiting subsystems to their localized status labels", () => {
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems({
          sentinel: { state: "report" },
          maestro: { state: "waiting" },
        })}
        thinking={false}
      />,
    );

    expect(
      within(screen.getByTestId(`${OrbMapTestId.Node}-sentinel`)).getByTestId(OrbNodeTestId.Status),
    ).toHaveTextContent("Hlášení připraveno");
    expect(
      within(screen.getByTestId(`${OrbMapTestId.Node}-maestro`)).getByTestId(OrbNodeTestId.Status),
    ).toHaveTextContent("Čeká na rozhodnutí");
  });

  it("falls back to idle for a subsystem missing from the roster", () => {
    // Drop `loom` from the roster entirely — the node still renders (fixed
    // registry order) and falls back to `idle`/0 rather than throwing.
    const subsystems = allSubsystems().filter((s) => s.id !== "loom");
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={subsystems}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-loom`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Status)).toHaveTextContent("V klidu");
  });

  it("derives a node's activeCount from active runs owned by its pipeline", () => {
    const pipelines = [pipeline({ id: "forge-a", ownerSubsystem: "forge" })];
    const runs = [
      run({ runId: "r1", owner: "forge-a", status: "running" }),
      run({ runId: "r2", owner: "forge-a", status: "queued" }),
    ];
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={pipelines}
        runs={runs}
        subsystems={allSubsystems()}
        thinking={false}
      />,
    );

    // One `OrbitField` dot per active task — the node's own `OrbitField` instance
    // renders exactly the 2 active runs above as orbiting dots.
    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-forge`);
    expect(within(wrapper).getAllByTestId(OrbitFieldTestId.Dot)).toHaveLength(2);
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

    /** Mounts `SubsystemOrbMap` under a real `RunEventsProvider` so a mocked SSE
     * frame reaches the adapter's own `onRunEvent` subscription — exactly the bus
     * `ChatScreen`'s real tree provides at `apps/web/app/providers.tsx`. */
    function renderUnderBus(pipelines: Pipeline[], runs: RunView[]) {
      renderWithProviders(
        <RunEventsProvider>
          <SubsystemOrbMap
            onOpenCore={vi.fn()}
            onSelectSubsystem={vi.fn()}
            pipelines={pipelines}
            runs={runs}
            subsystems={allSubsystems()}
            thinking={false}
          />
        </RunEventsProvider>,
      );
    }

    it("a dispatch run-event (pipeline-runs → running) appends a flare from the core to the owning subsystem", () => {
      const pipelines = [pipeline({ id: "forge-a", ownerSubsystem: "forge" })];
      const runs = [run({ runId: "r1", owner: "forge-a", status: "running" })];
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
      const pipelines = [pipeline({ id: "forge-a", ownerSubsystem: "forge" })];
      const runs = [run({ runId: "r1", owner: "forge-a", status: "running" })];
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
