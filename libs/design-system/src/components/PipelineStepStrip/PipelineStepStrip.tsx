import { Fragment } from "react";
import type { Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { StateDot } from "../StatePill/StatePill";

export interface PipelineStepStripPhase {
  label: string;
  state: StateTone;
  /** The connector rendered *after* this phase points back to an earlier
   *  phase (`⇄`) instead of forward (`→`) — a code-review rework loop. */
  loopBack?: boolean;
}

export enum PipelineStepStripTestId {
  Root = "pipeline-step-strip-root",
  /** Each phase chip is suffixed with its index, e.g. `pipeline-step-strip-step-0`. */
  Step = "pipeline-step-strip-step",
  Connector = "pipeline-step-strip-connector",
}

export interface PipelineStepStripProps {
  phases: PipelineStepStripPhase[];
  /** Index of the in-flight phase, given the `--ink` border. */
  current?: number;
  ref?: Ref<HTMLDivElement>;
}

/** DS.md §8 flow/handoff step grid, phase-level — a row of `ROLE` chips joined
 * by `→` (or `⇄` for a rework loop-back), inside one subtask's pipeline. */
export function PipelineStepStrip({ phases, current, ref }: PipelineStepStripProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid={PipelineStepStripTestId.Root}
      ref={ref}
      role="list"
    >
      {phases.map((phase, i) => (
        <Fragment key={i}>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 border bg-background px-[9px] py-[6px]",
              "font-mono text-[10px] font-semibold tracking-wider uppercase",
              i === current ? "border-ink" : "border-border",
            )}
            data-testid={`${PipelineStepStripTestId.Step}-${i}`}
            role="listitem"
          >
            <StateDot px={7} state={phase.state} />
            {phase.label}
          </span>
          {i < phases.length - 1 && (
            <span
              aria-hidden="true"
              className="text-foreground-faint text-xs"
              data-testid={PipelineStepStripTestId.Connector}
            >
              {phase.loopBack ? "⇄" : "→"}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
