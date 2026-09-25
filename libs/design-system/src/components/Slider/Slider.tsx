import type { ChangeEvent, Ref } from "react";
import { useId } from "react";
import { Row, Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum SliderTestId {
  Root = "slider-root",
  Label = "slider-label",
  Readout = "slider-readout",
  Input = "slider-input",
  Caption = "slider-caption",
}

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  /** Formats the live readout next to the label; defaults to the raw number. */
  format?: (value: number) => string;
  caption?: string;
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** A labeled native range input with a live readout — the Ledger spend
 * threshold control. Sealed to the DS.md §8 hairline input look via
 * `accent-color: var(--color-ink)`. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  caption,
  disabled,
  ref,
}: SliderProps) {
  const labelId = useId();
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));
  return (
    <Stack data-testid={SliderTestId.Root} gap="100">
      <Row justify="between">
        <Typography data-testid={SliderTestId.Label} id={labelId} type="body">
          {label}
        </Typography>
        <Typography mono data-testid={SliderTestId.Readout} type="body">
          {format ? format(value) : value}
        </Typography>
      </Row>
      <input
        aria-labelledby={labelId}
        className="w-full accent-[var(--color-ink)]"
        data-testid={SliderTestId.Input}
        disabled={disabled}
        max={max}
        min={min}
        onChange={handleChange}
        ref={ref}
        step={step}
        type="range"
        value={value}
      />
      {caption && (
        <Typography data-testid={SliderTestId.Caption} type="caption" variant="secondary">
          {caption}
        </Typography>
      )}
    </Stack>
  );
}
