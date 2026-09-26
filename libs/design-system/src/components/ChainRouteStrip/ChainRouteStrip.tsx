import { Fragment } from "react";
import type { Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import type { GateMode } from "../GateToggle/GateToggle";
import { StateDot } from "../StatePill/StatePill";
import { Typography } from "../Typography/Typography";

export interface ChainRouteStripStep {
  code: string;
  name: string;
  state: StateTone;
  pipeline?: string;
  selected?: boolean;
}

export interface ChainRouteStripGate {
  mode: GateMode;
  onClick?: () => void;
}

export type ChainRouteStripSize = "full" | "compact" | "chip";

export enum ChainRouteStripTestId {
  Root = "chain-route-strip-root",
  /** Each step is suffixed with its index, e.g. `chain-route-strip-step-0`. */
  Step = "chain-route-strip-step",
  StepCode = "chain-route-strip-step-code",
  StepName = "chain-route-strip-step-name",
  Connector = "chain-route-strip-connector",
  /** Each gate marker is suffixed with its index, e.g. `chain-route-strip-gate-0`. */
  Gate = "chain-route-strip-gate",
}

const gateModeLabel: Record<GateMode, string> = { auto: "Auto", ask: "Ask", silent: "Silent" };

export interface ChainRouteStripProps {
  steps: ChainRouteStripStep[];
  /** One entry per connector, `steps.length - 1` long. */
  gates?: ChainRouteStripGate[];
  size?: ChainRouteStripSize;
  onStepClick?: (index: number) => void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8 flow/handoff row, department-level — the horizontal `SUB N · CODE`
 * step sequence with `→ GATE` connectors, in three densities: `chip` (a task
 * row's inline progress summary), `compact` (New task's route preview /
 * Chains library row) and `full` (Task detail's corner-bracketed focus panel).
 */
export function ChainRouteStrip({
  steps,
  gates,
  size = "full",
  onStepClick,
  ref,
}: ChainRouteStripProps) {
  if (size === "chip") {
    return (
      <div
        className="flex flex-wrap items-center gap-1"
        data-testid={ChainRouteStripTestId.Root}
        ref={ref}
        role="list"
      >
        {steps.map((step, i) => (
          <Fragment key={step.code}>
            <StepChip
              index={i}
              onStepClick={onStepClick}
              step={step}
              testId={`${ChainRouteStripTestId.Step}-${i}`}
            />
            {i < steps.length - 1 && (
              <Typography
                aria-hidden="true"
                data-testid={ChainRouteStripTestId.Connector}
                type="labelSm"
                variant="tertiary"
              >
                →
              </Typography>
            )}
          </Fragment>
        ))}
      </div>
    );
  }

  if (size === "compact") {
    return (
      <div
        className="flex flex-col gap-0"
        data-testid={ChainRouteStripTestId.Root}
        ref={ref}
        role="list"
      >
        {steps.map((step, i) => (
          <Fragment key={step.code}>
            <CompactStep index={i} onStepClick={onStepClick} step={step} />
            {i < steps.length - 1 && gates?.[i] && (
              <GateMarker vertical gate={gates[i]} index={i} />
            )}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-stretch"
      data-testid={ChainRouteStripTestId.Root}
      ref={ref}
      role="list"
    >
      {steps.map((step, i) => (
        <Fragment key={step.code}>
          <FullStep index={i} onStepClick={onStepClick} step={step} />
          {i < steps.length - 1 && gates?.[i] && <GateMarker gate={gates[i]} index={i} />}
        </Fragment>
      ))}
    </div>
  );
}

function StepChip({
  step,
  index,
  onStepClick,
  testId,
}: {
  step: ChainRouteStripStep;
  index: number;
  onStepClick?: (index: number) => void;
  testId: string;
}) {
  const clickable = Boolean(onStepClick);
  const className = cn(
    "inline-flex items-center gap-1.5 border px-[6px] py-[3px]",
    "font-mono text-[10px] tracking-wider",
    step.selected ? "border-ink" : "border-border-strong",
    clickable && cn("cursor-pointer hover:border-ink", focusRing),
  );
  const inner = (
    <>
      <StateDot px={6} state={step.state} />
      {step.code}
    </>
  );
  if (clickable) {
    return (
      <button
        className={className}
        data-testid={testId}
        onClick={() => onStepClick?.(index)}
        role="listitem"
        type="button"
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={className} data-testid={testId} role="listitem">
      {inner}
    </span>
  );
}

function CompactStep({
  step,
  index,
  onStepClick,
}: {
  step: ChainRouteStripStep;
  index: number;
  onStepClick?: (index: number) => void;
}) {
  const clickable = Boolean(onStepClick);
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      className={cn(
        "flex flex-col gap-1.5 border bg-background px-3 py-2.5 text-left",
        step.selected ? "border-ink" : "border-border",
        clickable && cn("cursor-pointer hover:border-ink", focusRing),
      )}
      data-testid={`${ChainRouteStripTestId.Step}-${index}`}
      onClick={clickable ? () => onStepClick?.(index) : undefined}
      role="listitem"
      type={clickable ? "button" : undefined}
    >
      <div className="flex items-center justify-between">
        <Typography data-testid={ChainRouteStripTestId.StepCode} tracking="wider" type="labelSm">
          Sub {index + 1} · {step.code}
        </Typography>
        {step.pipeline && (
          <Typography tracking="wider" type="labelSm" variant="secondary">
            {step.pipeline}
          </Typography>
        )}
      </div>
      <Typography data-testid={ChainRouteStripTestId.StepName} type="body" weight="medium">
        {step.name}
      </Typography>
    </Tag>
  );
}

function FullStep({
  step,
  index,
  onStepClick,
}: {
  step: ChainRouteStripStep;
  index: number;
  onStepClick?: (index: number) => void;
}) {
  const clickable = Boolean(onStepClick);
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 border p-3 text-left",
        step.selected ? "border-ink bg-surface-panel" : "border-border bg-background",
        clickable && cn("cursor-pointer hover:border-ink", focusRing),
      )}
      data-testid={`${ChainRouteStripTestId.Step}-${index}`}
      onClick={clickable ? () => onStepClick?.(index) : undefined}
      role="listitem"
      type={clickable ? "button" : undefined}
    >
      <div className="flex items-center justify-between">
        <Typography data-testid={ChainRouteStripTestId.StepCode} tracking="wider" type="labelSm">
          Sub {index + 1} · {step.code}
        </Typography>
        <StateDot px={7} state={step.state} />
      </div>
      <Typography data-testid={ChainRouteStripTestId.StepName} type="body" weight="medium">
        {step.name}
      </Typography>
      {step.pipeline && (
        <Typography type="caption" variant="secondary">
          Pipeline {step.pipeline}
        </Typography>
      )}
    </Tag>
  );
}

function GateMarker({
  gate,
  index,
  vertical,
}: {
  gate: ChainRouteStripGate;
  index: number;
  vertical?: boolean;
}) {
  const Tag = gate.onClick ? "button" : "div";
  return (
    <Tag
      className={cn(
        "flex shrink-0 items-center font-mono text-[10px] tracking-wider text-foreground-faint",
        vertical ? "flex-col gap-1 self-center py-1.5" : "w-[58px] flex-col gap-1 justify-center",
        gate.onClick && cn("cursor-pointer hover:text-foreground", focusRing),
      )}
      data-testid={`${ChainRouteStripTestId.Gate}-${index}`}
      onClick={gate.onClick}
      type={gate.onClick ? "button" : undefined}
    >
      <span aria-hidden="true">{vertical ? "↓" : "→"}</span>
      <span>Gate</span>
      <span className="text-foreground">{gateModeLabel[gate.mode]}</span>
    </Tag>
  );
}
