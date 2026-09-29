"use client";

import { useTranslations } from "next-intl";
import { Field, NumberField, Stack } from "@zibby/design-system";

/** Suffixes appended to the caller's testid prefix, one per unit input. */
export enum DurationFieldTestId {
  Hours = "hours",
  Minutes = "minutes",
}

export interface DurationFieldProps {
  label: string;
  hint?: string;
  /** Duration in milliseconds (the config's unit). */
  valueMs: number | null;
  onValueChange: (ms: number) => void;
  /** Prefix for the per-unit testids (`<prefix>-hours` …). */
  "data-testid": string;
}

/**
 * A millisecond duration edited as hours / minutes. The caller keeps milliseconds;
 * this only splits them for display and recomposes on every edit, so an overflowing
 * part (90 min) simply re-splits to 1 h 30 min. A cleared part is 0. A sub-minute
 * value (the legacy 30 s defaults) displays rounded UP so it never reads as 0 (= off);
 * it round-trips untouched until the operator edits it.
 */
export function DurationField({
  label,
  hint,
  valueMs,
  onValueChange,
  "data-testid": testId,
}: DurationFieldProps) {
  const t = useTranslations("settings.runtime");
  const total = Math.max(0, Math.ceil((valueMs ?? 0) / 60_000));
  const parts = {
    [DurationFieldTestId.Hours]: Math.floor(total / 60),
    [DurationFieldTestId.Minutes]: total % 60,
  };

  const set = (unit: DurationFieldTestId, value: number | null) => {
    const next = { ...parts, [unit]: Math.max(0, Math.floor(value ?? 0)) };
    onValueChange(
      (next[DurationFieldTestId.Hours] * 60 + next[DurationFieldTestId.Minutes]) * 60_000,
    );
  };

  return (
    <Field hint={hint} label={label}>
      {({ labelId, describedBy }) => (
        <Stack aria-labelledby={labelId} direction="row" gap="150" role="group">
          {Object.values(DurationFieldTestId).map((unit) => (
            <NumberField
              aria-describedby={describedBy}
              aria-label={`${label} — ${t(`unit.${unit}`)}`}
              data-testid={`${testId}-${unit}`}
              key={unit}
              label={t(`unit.${unit}`)}
              min={0}
              onValueChange={(value) => set(unit, value)}
              value={parts[unit]}
            />
          ))}
        </Stack>
      )}
    </Field>
  );
}
