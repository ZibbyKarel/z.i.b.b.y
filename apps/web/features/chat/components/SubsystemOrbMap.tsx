"use client";

import {
  SUBSYSTEMS,
  type SubsystemId,
  type SubsystemState,
  type SubsystemWithStatus,
} from "@zibby/contracts";
import {
  Icon,
  type IconName,
  OrbMap,
  type OrbMapFlare,
  type OrbMapNode,
  type OrbState,
  resolveStateToneHex,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Pipeline } from "../../../domain";
import type { RunView } from "../../runs/run";
import { activeRunsBySubsystem } from "../subsystemLoad";

export enum SubsystemOrbMapTestId {
  Root = "subsystem-orb-map-root",
}

export interface SubsystemOrbMapProps {
  subsystems: SubsystemWithStatus[];
  runs: readonly RunView[];
  pipelines: readonly Pipeline[];
  selectedSubsystemId: SubsystemId | null;
  /** Chat streaming flag — feeds the core orb's thinking pulse. */
  thinking: boolean;
  /** Optional real hand-off events, passed straight through to `OrbMap`. */
  flares?: OrbMapFlare[];
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

/**
 * The thin domain→DS adapter (Task 12): maps the subsystem roster + active runs
 * onto `OrbMap`'s generic node/core props, in the fixed `SUBSYSTEMS` registry
 * order so the 8-node ring never reflows when the feed order changes.
 *
 * `insets` is intentionally NOT exposed here — `ChatScreen` (Task 13) measures the
 * tasks-panel width and chat-dock height and will thread real insets through the
 * seam once it swaps this component in; until then `OrbMap` falls back to its own
 * all-zero default.
 *
 * `selectedSubsystemId` is kept for interface parity with the seam contract, but
 * unused here: phase-1 selection visuals belong to whatever opens on selection
 * (the subsystem drawer), not this map.
 */
export function SubsystemOrbMap({
  subsystems,
  runs,
  pipelines,
  selectedSubsystemId: _selectedSubsystemId,
  thinking,
  flares,
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
        nodes={nodes}
        onSelectCore={onOpenCore}
        onSelectNode={(id) => onSelectSubsystem(id as SubsystemId)}
      />
    </div>
  );
}
