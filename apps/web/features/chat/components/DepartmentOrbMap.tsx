"use client";

import {
  type Agent,
  DEPARTMENTS,
  type DepartmentId,
  type DepartmentWithStatus,
} from "@zibby/contracts";
import {
  type EllipseInsets,
  Icon,
  ORB_MAP_CORE_ID,
  OrbMap,
  type OrbMapFlare,
  type OrbMapNode,
  resolveStateToneHex,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pipeline } from "../../../domain";
import type { RunView } from "../../runs/run";
import { onRunEvent } from "../../runs/runEvents";
import {
  type EventFlight,
  appendParticle,
  flightForEvent,
} from "../../departments/components/DepartmentWeb/particle-mapping";
import { DEPARTMENT_GLYPH, DEPARTMENT_ORB_STATE } from "../../departments/departmentVisuals";
import { activeRunsByDepartment } from "../departmentLoad";

export enum DepartmentOrbMapTestId {
  Root = "department-orb-map-root",
}

export interface DepartmentOrbMapProps {
  departments: DepartmentWithStatus[];
  runs: readonly RunView[];
  pipelines: readonly Pipeline[];
  /**
   * The agent catalog — Phase 126g: an agent-kind run attributes to its
   * `Agent.department` the same way a pipeline-kind run already attributes
   * to `Pipeline.department`, both for `activeRunsByDepartment`'s orbit-field
   * dot count and for `flightForEvent`'s handoff-flare classification.
   */
  agents: readonly Agent[];
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
  onSelectDepartment: (id: DepartmentId) => void;
}

/** Core heartbeat curve: calm at rest, busier with more active runs, capped so a
 * flood of concurrent work never blows past a readable glow. Mirrors the VcMapD
 * prototype's idle → busy intensity ramp. */
const CORE_BASE_INTENSITY = 0.28;
const CORE_INTENSITY_PER_RUN = 0.08;
const CORE_MAX_INTENSITY = 0.7;
/** The prototype's fixed core orbit-field dot count (generic in `OrbMapCore`,
 * but the app always renders 4 regardless of active-run count). */
const CORE_ACTIVE_COUNT = 0;

/** An `EventFlight` endpoint (`DepartmentId | "orb"`) → an `OrbMapFlare`
 * `fromId`/`toId` — the orb side maps to `OrbMap`'s reserved core id, a real
 * department endpoint passes through unchanged. */
function toFlareEndpoint(id: EventFlight["from"]): string {
  return id === "orb" ? ORB_MAP_CORE_ID : id;
}

/**
 * The thin domain→DS adapter (Task 12): maps the department roster + active runs
 * onto `OrbMap`'s generic node/core props, in the fixed `DEPARTMENTS` registry
 * order so the 8-node ring never reflows when the feed order changes.
 *
 * `insets` (Task 13) passes straight through to `OrbMap` — `ChatScreen` supplies
 * the seam's real layout reserves (tasks-panel width, composer band height);
 * omitted, `OrbMap` falls back to its own all-zero default.
 *
 * There is no selection-ring visual on the node itself — picking a department
 * only reports the id via `onSelectDepartment`; whatever opens on selection
 * (the department drawer) owns showing that it's selected.
 *
 * Task 13b: owns the comet handoff-flares' state end to end (the gap the retired
 * `CosmicScene`'s `emitFlight` used to close). Subscribes to the shared
 * `RunEventsProvider` bus once and, for every event, runs the SAME pure
 * `flightForEvent` classifier the old scene's WebGL particles used (real
 * dispatch/report transitions only — never a timer, never a guess): a
 * `pipeline-runs` event that resolves to an owning department becomes a flare
 * from the core to that department (`running`, a dispatch) or from the
 * department back to the core (`done`/`failed`/`parked`, a report). Flares are
 * appended and bounded by `particle-mapping.ts`'s own `MAX_PARTICLES` cap (the
 * SAME "~12, thin the tail" bound the old scene enforced) and pruned via
 * `OrbMap`'s `onFlareDone` once each comet's lifetime ends — fully internal:
 * the caller never drives `flares` itself.
 */
export function DepartmentOrbMap({
  departments,
  runs,
  pipelines,
  agents,
  thinking,
  insets,
  onOpenCore,
  onSelectDepartment,
}: DepartmentOrbMapProps) {
  const t = useTranslations("departments");

  const statusById = new Map<DepartmentId, DepartmentWithStatus>(departments.map((s) => [s.id, s]));
  const counts = activeRunsByDepartment(runs, pipelines, agents);

  const nodes: OrbMapNode[] = DEPARTMENTS.map((sub) => {
    const state = statusById.get(sub.id)?.state ?? "idle";
    return {
      id: sub.id,
      hex: sub.color,
      state: DEPARTMENT_ORB_STATE[state],
      label: sub.name,
      ariaLabel: t("nodeAria", { name: sub.name, state: t(`state.${state}`) }),
      icon: <Icon name={DEPARTMENT_GLYPH[sub.id]} size="lg" />,
      activeCount: counts[sub.id] ?? 0,
    };
  });

  const runningCount = Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);

  // Read `runs`/`pipelines`/`agents` through refs (mirrors the retired
  // `CosmicScene`'s own pattern) so a query refetch's fresh array reference
  // never tears down and resubscribes the `onRunEvent` listener below — the
  // shared bus's one `EventSource` keeps delivering events the whole time
  // regardless.
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const pipelinesRef = useRef(pipelines);
  useEffect(() => {
    pipelinesRef.current = pipelines;
  }, [pipelines]);
  const agentsRef = useRef(agents);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  const [flares, setFlares] = useState<OrbMapFlare[]>([]);
  // Tiebreaker for two events landing in the same millisecond — appended to the
  // id so they never collide even though `Date.now()` alone might.
  const flareSeq = useRef(0);

  useEffect(() => {
    return onRunEvent((event) => {
      const flight = flightForEvent(
        event,
        runsRef.current,
        pipelinesRef.current,
        agentsRef.current,
      );
      if (!flight) return;
      flareSeq.current += 1;
      const color = DEPARTMENTS.find((s) => s.id === flight.departmentId)?.color;
      const id = `flare-${flight.departmentId}-${event.runId ?? "run"}-${event.status ?? "status"}-${Date.now()}-${flareSeq.current}`;
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
    <div data-testid={DepartmentOrbMapTestId.Root}>
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
        onSelectNode={(id) => onSelectDepartment(id as DepartmentId)}
      />
    </div>
  );
}
