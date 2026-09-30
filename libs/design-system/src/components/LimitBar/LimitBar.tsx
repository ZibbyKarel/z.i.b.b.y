import type { Ref } from "react";
import { Typography } from "../Typography/Typography";
import { getUsageTone } from "../Progress/Progress";

export enum LimitBarTestId {
  Root = "limit-bar-root",
  Label = "limit-bar-label",
  Value = "limit-bar-value",
  Track = "limit-bar-track",
  Fill = "limit-bar-fill",
}

export interface LimitBarProps {
  /** Short mono label, e.g. `"5H"` or `"WEEK"`. */
  label: string;
  value: number;
  max: number;
  ref?: Ref<HTMLDivElement>;
}

/** A compact header variant of {@link BudgetMeter} — the top bar's `5H`/`WEEK`
 * rolling-usage readout: one row, label / 2px track / percentage — a `LimitBar`
 * pair stacks (`AppShell`'s `useHeaderTrailing`) into the two-row usage
 * readout next to search. */
export function LimitBar({ label, value, max, ref }: LimitBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tone = getUsageTone(pct);
  return (
    <div
      className="grid grid-cols-[44px_96px_30px] items-center gap-2"
      data-testid={LimitBarTestId.Root}
      ref={ref}
    >
      <Typography
        data-testid={LimitBarTestId.Label}
        tracking="wider"
        type="labelSm"
        variant="primary"
      >
        {label}
      </Typography>
      <div
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={value}
        className="relative h-[4px] w-full bg-border"
        data-testid={LimitBarTestId.Track}
        role="meter"
      >
        <div
          className={
            tone === "bad"
              ? "absolute inset-y-0 left-0 bg-bad"
              : tone === "warn"
                ? "absolute inset-y-0 left-0 bg-warn"
                : "absolute inset-y-0 left-0 bg-ink"
          }
          data-testid={LimitBarTestId.Fill}
          style={{ width: `${pct}%` }}
        />
      </div>
      <Typography
        align="right"
        data-testid={LimitBarTestId.Value}
        tracking="wider"
        type="labelSm"
        variant="primary"
      >
        {Math.round(pct)}%
      </Typography>
    </div>
  );
}
