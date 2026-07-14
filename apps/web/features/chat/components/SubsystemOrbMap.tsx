"use client";

import {
  SUBSYSTEMS,
  type SubsystemId,
  type SubsystemState,
  type SubsystemWithStatus,
} from "@zibby/contracts";
import {
  type EllipseInsets,
  Icon,
  type IconName,
  ORB_MAP_CORE_ID,
  OrbMap,
  type OrbMapFlare,
  type OrbMapNode,
  type OrbState,
  resolveStateToneHex,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pipeline } from "../../../domain";
import { onRunEvent } from "../../runs/runEvents";
import type { RunView } from "../../runs/run";
import {
  type EventFlight,
  appendParticle,
  flightForEvent,
} from "../../subsystems/components/SubsystemWeb/particle-mapping";
import { activeRunsBySubsystem } from "../subsystemLoad";

export enum SubsystemOrbMapTestId {
  Root = "subsystem-orb-map-root",
}

export interface SubsystemOrbMapProps {
  subsystems: SubsystemWithStatus[];
  runs: readonly RunView[];
  pipelines: readonly Pipeline[];
  /** Chat streaming flag — feeds the core orb's thinking pulse. */
  thinking: boolean;
  /**
   * Layout reserves (tasks panel, dock, chat bar), passed straight through to
   * `OrbMap` — merged over its own all-zero default when omitted. Added by
   * Task 13 so `ChatScreen` can thread the real seam insets (its 300px left
   * tasks-panel gutter, the composer band's height) without the orb ellipse
   * ever computing them itself.
   */
  insets?: Partial<EllipseInsets>;
  onOpenCore: () => void;
  onSelectSubsystem: (id: SubsystemId) => void;
}

/** English `SubsystemState` (contracts) → immersive `OrbState` (DS). */
const STATE_MAP: Record<SubsystemState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
};

/** One glyph per subsystem identity — verified present in the DS icon set
 * (`libs/design-system/src/assets/icons`). */
const ICON_MAP: Record<SubsystemId, IconName> = {
  forge: "code",
  herald: "link",
  sentinel: "shield",
  scout: "compass",
  maestro: "checkpoint",
  beacon: "warn",
  puls: "pulse",
  loom: "search",
};

/** Core heartbeat curve: calm at rest, busier with more active runs, capped so a
 * flood of concurrent work never blows past a readable glow. Mirrors the VcMapD
 * prototype's idle → busy intensity ramp. */
const CORE_BASE_INTENSITY = 0.28;
const CORE_INTENSITY_PER_RUN = 0.08;
const CORE_MAX_INTENSITY = 0.7;
/** The prototype's fixed core orbit-field dot count (generic in `OrbMapCore`,
 * but the app always renders 4 regardless of active-run count). */
const CORE_ACTIVE_COUNT = 4;

/** An `EventFlight` endpoint (`SubsystemId | "orb"`) → an `OrbMapFlare`
 * `fromId`/`toId` — the orb side maps to `OrbMap`'s reserved core id, a real
 * subsystem endpoint passes through unchanged. */
function toFlareEndpoint(id: EventFlight["from"]): string {
  return id === "orb" ? ORB_MAP_CORE_ID : id;
}

/**
 * The thin domain→DS adapter (Task 12): maps the subsystem roster + active runs
 * onto `OrbMap`'s generic node/core props, in the fixed `SUBSYSTEMS` registry
 * order so the 8-node ring never reflows when the feed order changes.
 *
 * `insets` (Task 13) passes straight through to `OrbMap` — `ChatScreen` supplies
 * the seam's real layout reserves (tasks-panel width, composer band height);
 * omitted, `OrbMap` falls back to its own all-zero default.
 *
 * There is no selection-ring visual on the node itself — picking a subsystem
 * only reports the id via `onSelectSubsystem`; whatever opens on selection
 * (the subsystem drawer) owns showing that it's selected.
 *
 * Task 13b: owns the comet handoff-flares' state end to end (the gap the retired
 * `CosmicScene`'s `emitFlight` used to close). Subscribes to the shared
 * `RunEventsProvider` bus once and, for every event, runs the SAME pure
 * `flightForEvent` classifier the old scene's WebGL particles used (real
 * dispatch/report transitions only — never a timer, never a guess): a
 * `pipeline-runs` event that resolves to an owning subsystem becomes a flare
 * from the core to that subsystem (`running`, a dispatch) or from the
 * subsystem back to the core (`done`/`failed`/`parked`, a report). Flares are
 * appended and bounded by `particle-mapping.ts`'s own `MAX_PARTICLES` cap (the
 * SAME "~12, thin the tail" bound the old scene enforced) and pruned via
 * `OrbMap`'s `onFlareDone` once each comet's lifetime ends — fully internal:
 * the caller never drives `flares` itself.
 */
export function SubsystemOrbMap({
  subsystems,
  runs,
  pipelines,
  thinking,
  insets,
  onOpenCore,
  onSelectSubsystem,
}: SubsystemOrbMapProps) {
  const t = useTranslations("subsystems");

  const statusById = new Map<SubsystemId, SubsystemWithStatus>(
    subsystems.map((s) => [s.id, s]),
  );
  const counts = activeRunsBySubsystem(runs, pipelines);

  const nodes: OrbMapNode[] = SUBSYSTEMS.map((sub) => {
    const state = statusById.get(sub.id)?.state ?? "idle";
    return {
      id: sub.id,
      hex: sub.color,
      state: STATE_MAP[state],
      label: sub.name,
      statusLabel: t(`state.${state}`),
      icon: <Icon name={ICON_MAP[sub.id]} size="lg" />,
      activeCount: counts[sub.id] ?? 0,
    };
  });

  const runningCount = Object.values(counts).reduce<number>(
    (sum, n) => sum + (n ?? 0),
    0,
  );

  // Read `runs`/`pipelines` through refs (mirrors the retired `CosmicScene`'s own
  // pattern) so a query refetch's fresh array reference never tears down and
  // resubscribes the `onRunEvent` listener below — the shared bus's one
  // `EventSource` keeps delivering events the whole time regardless.
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const pipelinesRef = useRef(pipelines);
  useEffect(() => {
    pipelinesRef.current = pipelines;
  }, [pipelines]);

  const [flares, setFlares] = useState<OrbMapFlare[]>([]);
  // Tiebreaker for two events landing in the same millisecond — appended to the
  // id so they never collide even though `Date.now()` alone might.
  const flareSeq = useRef(0);

  useEffect(() => {
    return onRunEvent((event) => {
      const flight = flightForEvent(event, runsRef.current, pipelinesRef.current);
      if (!flight) return;
      flareSeq.current += 1;
      const color = SUBSYSTEMS.find((s) => s.id === flight.subsystemId)?.color;
      const id = `flare-${flight.subsystemId}-${event.runId ?? "run"}-${event.status ?? "status"}-${Date.now()}-${flareSeq.current}`;
      const next: OrbMapFlare = {
        id,
        fromId: toFlareEndpoint(flight.from),
        toId: toFlareEndpoint(flight.to),
        color,
      };
      setFlares((prev) => appendParticle(prev, next));
    });
    // Subscribe once — the refs above keep the closure's data fresh without ever
    // needing to unsubscribe/resubscribe.
  }, []);

  const handleFlareDone = useCallback((id: string) => {
    setFlares((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div data-testid={SubsystemOrbMapTestId.Root}>
      <OrbMap
        core={{
          hex: resolveStateToneHex("accent"),
          activeCount: CORE_ACTIVE_COUNT,
          intensity: Math.min(
            CORE_MAX_INTENSITY,
            CORE_BASE_INTENSITY + runningCount * CORE_INTENSITY_PER_RUN,
          ),
          thinking,
        }}
        flares={flares}
        insets={insets}
        nodes={nodes}
        onFlareDone={handleFlareDone}
        onSelectCore={onOpenCore}
        onSelectNode={(id) => onSelectSubsystem(id as SubsystemId)}
      />
    </div>
  );
}
