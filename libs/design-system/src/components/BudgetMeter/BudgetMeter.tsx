import type { Ref } from "react";
import { Card, CardContent } from "../Card/Card";
import { Row, Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";
import { getUsageTone } from "../Progress/Progress";

export enum BudgetMeterTestId {
  Root = "budget-meter-root",
  Label = "budget-meter-label",
  Value = "budget-meter-value",
  Track = "budget-meter-track",
  Fill = "budget-meter-fill",
  WarnTick = "budget-meter-warn-tick",
  StopTick = "budget-meter-stop-tick",
  Caption = "budget-meter-caption",
}

export interface BudgetMeterProps {
  label: string;
  value: number;
  max: number;
  /** Position of the warn threshold tick mark, as a raw value on the same scale as `value`/`max`. */
  warnAt?: number;
  /** Position of the stop threshold tick mark. */
  stopAt?: number;
  caption?: string;
  ref?: Ref<HTMLDivElement>;
}

/** DS.md §8 Ledger card — label + big value, a thin fill track with optional
 * warn/stop threshold ticks overlaid, and a caption. Two call shapes: a plain
 * cap card (`warnAt`/`stopAt` omitted) and a dual-threshold spend meter. */
export function BudgetMeter({ label, value, max, warnAt, stopAt, caption, ref }: BudgetMeterProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tone = getUsageTone(pct);
  return (
    <Card background="panel" data-testid={BudgetMeterTestId.Root} radius="none" ref={ref}>
      <CardContent padding="200">
        <Stack gap="100">
          <Row justify="between">
            <Typography data-testid={BudgetMeterTestId.Label} tracking="wider" type="labelSm">
              {label}
            </Typography>
            <Typography tracking="wider" type="labelSm" variant="secondary">
              {Math.round(pct)}%
            </Typography>
          </Row>
          <Typography data-testid={BudgetMeterTestId.Value} type="h2">
            {value}
          </Typography>
          <div
            aria-label={label}
            aria-valuemax={max}
            aria-valuemin={0}
            aria-valuenow={value}
            className="relative h-[6px] bg-border"
            data-testid={BudgetMeterTestId.Track}
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
              data-testid={BudgetMeterTestId.Fill}
              style={{ width: `${pct}%` }}
            />
            {warnAt !== undefined && max > 0 && (
              <div
                className="absolute -top-[3px] -bottom-[3px] w-px bg-foreground-dim"
                data-testid={BudgetMeterTestId.WarnTick}
                style={{ left: `${Math.max(0, Math.min(100, (warnAt / max) * 100))}%` }}
              />
            )}
            {stopAt !== undefined && max > 0 && (
              <div
                className="absolute -top-[3px] -bottom-[3px] w-px bg-ink"
                data-testid={BudgetMeterTestId.StopTick}
                style={{ left: `${Math.max(0, Math.min(100, (stopAt / max) * 100))}%` }}
              />
            )}
          </div>
          {caption && (
            <Typography data-testid={BudgetMeterTestId.Caption} type="caption" variant="secondary">
              {caption}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
