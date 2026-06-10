"use client";

import { useState } from "react";
import type { AgentModel, AgentThinking } from "@zibby/contracts";
import type { Pipeline } from "../../../domain";

const CYCLE_MODEL: AgentModel[] = ["opus", "sonnet", "haiku"];
const CYCLE_THINK: AgentThinking[] = ["high", "medium", "low"];
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!;

/** Per-phase model/thinking override, seeded from the pipeline's defaults. */
export interface PhaseOverride {
  model: AgentModel;
  thinking: AgentThinking;
}

/**
 * The per-phase override state of the pipeline run dialog: one model/thinking
 * pair per phase, each cycled through the fixed option order by the badge
 * buttons. Seeded from the pipeline definition; the dialog only renders.
 */
export function usePhaseOverrides(pipeline: Pipeline) {
  const [overrides, setOverrides] = useState<PhaseOverride[]>(
    pipeline.phases.map((p) => ({ model: p.model, thinking: p.thinking })),
  );

  const cycleModel = (i: number) =>
    setOverrides((o) =>
      o.map((x, j) => (j === i ? { ...x, model: next(CYCLE_MODEL, x.model) } : x)),
    );

  const cycleThink = (i: number) =>
    setOverrides((o) =>
      o.map((x, j) => (j === i ? { ...x, thinking: next(CYCLE_THINK, x.thinking) } : x)),
    );

  return { overrides, cycleModel, cycleThink };
}
