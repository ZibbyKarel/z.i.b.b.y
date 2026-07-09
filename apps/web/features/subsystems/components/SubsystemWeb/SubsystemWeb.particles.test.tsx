import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pipeline } from "../../../../domain";
import { installEventSourceMock } from "../../../../test/eventSourceMock";
import { renderWithProviders, screen } from "../../../../test/render";
import type { RunView } from "../../../runs/run";
import { RunEventsProvider } from "../../../runs/runEvents";
import { MAX_PARTICLES } from "./particle-mapping";
import { SubsystemWeb, SubsystemWebTestId } from "./SubsystemWeb";
import { pathFor } from "./subsystem-web-geometry";

// `API_URL` gates `RunEventsProvider` (no URL → no stream); pin it so the
// EventSource opens, same posture as `runEvents.test.tsx`.
vi.mock("../../../../state/api", () => ({ API_URL: "http://localhost:3333" }));

function fixture(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    heroImage: null,
    state: "klid",
    tier2Count: 0,
    tier3Count: 0,
    ...overrides,
  };
}

function allSubsystems() {
  return SUBSYSTEMS.map((s) => fixture({ id: s.id, name: s.name, color: s.color }));
}

function pipeline(id: string, ownerSubsystem: Pipeline["ownerSubsystem"]): Pipeline {
  return {
    id,
    name: id,
    lastRun: "—",
    lastState: "done",
    desc: "",
    file: `~/zibby/pipelines/${id}.pipeline.md`,
    phases: [],
    outputs: [],
    ownerSubsystem,
  };
}

function run(runId: string, owner: string): RunView {
  return {
    runId,
    kind: "pipeline",
    owner,
    processor: { kind: "pipeline", id: owner, name: owner },
    status: "running",
    prompt: "",
    startedAt: "2026-07-08T00:00:00.000Z",
  } as RunView;
}

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("SubsystemWeb particle layer (Phase 89)", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    stubReducedMotion(false);
    mock = installEventSourceMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("a pipeline-runs 'running' event for an owned, known pipeline mounts a dispatch (orb→node) particle on the right path", () => {
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb
          onSelect={vi.fn()}
          pipelines={[pipeline("delivery", "forge")]}
          runs={[run("delivery_1", "delivery")]}
          subsystems={allSubsystems()}
        />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
    });

    const particles = screen.getAllByTestId(SubsystemWebTestId.Particle);
    expect(particles).toHaveLength(1);
    const animateEl = particles[0]!.querySelector("animateMotion");
    expect(animateEl).not.toBeNull();
    expect(animateEl!.getAttribute("path")).toBe(pathFor("orb", "forge"));
  });

  it("a pipeline-runs 'done' event mounts a report (node→orb) particle", () => {
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb
          onSelect={vi.fn()}
          pipelines={[pipeline("delivery", "puls")]}
          runs={[run("delivery_1", "delivery")]}
          subsystems={allSubsystems()}
        />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "done" });
    });

    const particles = screen.getAllByTestId(SubsystemWebTestId.Particle);
    expect(particles).toHaveLength(1);
    const animateEl = particles[0]!.querySelector("animateMotion");
    expect(animateEl!.getAttribute("path")).toBe(pathFor("puls", "orb"));
  });

  it("an unattributable event (unknown run) mounts no particle", () => {
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb
          onSelect={vi.fn()}
          pipelines={[pipeline("delivery", "forge")]}
          runs={[]}
          subsystems={allSubsystems()}
        />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
    });

    expect(screen.queryByTestId(SubsystemWebTestId.Particle)).not.toBeInTheDocument();
  });

  it("an agent-runs event never mounts a particle (no ownerSubsystem path)", () => {
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb onSelect={vi.fn()} pipelines={[]} runs={[]} subsystems={allSubsystems()} />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "agent-runs", runId: "writer_1", status: "running" });
    });

    expect(screen.queryByTestId(SubsystemWebTestId.Particle)).not.toBeInTheDocument();
  });

  it("firing the animateMotion element's native endEvent unmounts exactly that particle", () => {
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb
          onSelect={vi.fn()}
          pipelines={[pipeline("delivery", "forge")]}
          runs={[run("delivery_1", "delivery")]}
          subsystems={allSubsystems()}
        />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
    });
    expect(screen.getAllByTestId(SubsystemWebTestId.Particle)).toHaveLength(1);

    const animateEl = screen.getByTestId(SubsystemWebTestId.Particle).querySelector("animateMotion")!;
    act(() => {
      animateEl.dispatchEvent(new Event("endEvent"));
    });

    expect(screen.queryByTestId(SubsystemWebTestId.Particle)).not.toBeInTheDocument();
  });

  it("caps concurrent particles at MAX_PARTICLES, dropping the oldest", () => {
    const pipelines = Array.from({ length: MAX_PARTICLES + 3 }, (_, i) => pipeline(`p${i}`, "forge"));
    const runs = pipelines.map((p, i) => run(`p${i}_1`, p.id));

    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb onSelect={vi.fn()} pipelines={pipelines} runs={runs} subsystems={allSubsystems()} />
      </RunEventsProvider>,
    );

    act(() => {
      for (const r of runs) {
        mock.last().emit({ scope: "pipeline-runs", runId: r.runId, status: "running" });
      }
    });

    expect(screen.getAllByTestId(SubsystemWebTestId.Particle)).toHaveLength(MAX_PARTICLES);
  });

  it("prefers-reduced-motion: renders a static glow (no animateMotion) at the destination node, removed on animationend", () => {
    stubReducedMotion(true);
    renderWithProviders(
      <RunEventsProvider>
        <SubsystemWeb
          onSelect={vi.fn()}
          pipelines={[pipeline("delivery", "forge")]}
          runs={[run("delivery_1", "delivery")]}
          subsystems={allSubsystems()}
        />
      </RunEventsProvider>,
    );

    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
    });

    const glow = screen.getByTestId(SubsystemWebTestId.Particle);
    expect(glow.querySelector("animateMotion")).toBeNull();
    expect(glow.tagName.toLowerCase()).toBe("circle");

    fireEvent.animationEnd(glow);
    expect(screen.queryByTestId(SubsystemWebTestId.Particle)).not.toBeInTheDocument();
  });
});
