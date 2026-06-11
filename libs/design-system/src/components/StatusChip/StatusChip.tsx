import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { StatusDot } from "../StatusDot/StatusDot";

/** Run-state taxonomy: done / running / awaiting user / error / idle. */
export type StatusChipState = "ok" | "run" | "wait" | "bad" | "idle";

const stateClass: Record<StatusChipState, string> = {
  ok: "text-ok border-ok/20 bg-ok/[0.06]",
  run: "text-run border-run/20 bg-run/[0.06]",
  wait: "text-warn border-warn/20 bg-warn/[0.06]",
  bad: "text-bad border-bad/20 bg-bad/[0.06]",
  idle: "text-foreground-faint border-border bg-[rgba(255,255,255,0.03)]",
};

/** English defaults — the app overrides with its own translations. */
const stateLabel: Record<StatusChipState, string> = {
  ok: "done",
  run: "running",
  wait: "waiting for you",
  bad: "error",
  idle: "idle",
};

/** Live states pulse; everything else is matte. */
const liveStates: ReadonlySet<StatusChipState> = new Set(["run", "wait"]);

export enum StatusChipTestId {
  Root = "status-chip-root",
  Dot = "status-chip-dot",
}

export interface StatusChipProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "className"
> {
  state: StatusChipState;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Status pill (design `ZtChip`) — a state dot + label in the state color.
 * Children override the default English label.
 */
export function StatusChip({ state, children, ref, ...props }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-2 pr-2.5",
        "font-mono text-xs whitespace-nowrap",
        stateClass[state],
      )}
      data-testid={StatusChipTestId.Root}
      ref={ref}
      {...props}
    >
      <StatusDot
        data-testid={StatusChipTestId.Dot}
        pulse={liveStates.has(state)}
        size="75"
        tone={state}
      />
      {children ?? stateLabel[state]}
    </span>
  );
}
