import type { HTMLAttributes, Ref } from "react";
import type { ProgressTone } from "../Progress/Progress";

export type ProgressRingSize = "sm" | "md" | "lg";

/** Outer diameter / stroke width per semantic size. */
const sizeSpec: Record<ProgressRingSize, { box: number; stroke: number; font: number }> = {
  sm: { box: 26, stroke: 2.5, font: 8 },
  md: { box: 30, stroke: 3, font: 9 },
  lg: { box: 44, stroke: 3.5, font: 11 },
};

const toneVar: Record<ProgressTone, string> = {
  accent: "var(--color-accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  run: "var(--color-run)",
};

export enum ProgressRingTestId {
  Root = "progress-ring-root",
  Value = "progress-ring-value",
}

export interface ProgressRingProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  /** Fill percentage, 0–100. */
  value: number;
  tone?: ProgressTone;
  size?: ProgressRingSize;
  /** Render the percentage in the ring's center. */
  showValue?: boolean;
  /** Accessible label; renders an ARIA progressbar when provided. */
  label?: string;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * A compact circular gauge — the top-bar limits readout. Matte ring on a
 * hairline track; the centered mono percentage is optional.
 */
export function ProgressRing({
  value,
  tone = "accent",
  size = "md",
  showValue = true,
  label,
  ref,
  ...props
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, value));
  const { box, stroke, font } = sizeSpec[size];
  const r = (box - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const color = toneVar[tone];

  return (
    <span
      aria-label={label}
      aria-valuemax={label ? 100 : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuenow={label ? pct : undefined}
      className="relative inline-flex shrink-0 items-center justify-center"
      data-testid={ProgressRingTestId.Root}
      ref={ref}
      role={label ? "progressbar" : undefined}
      style={{ width: box, height: box }}
      {...props}
    >
      <svg height={box} viewBox={`0 0 ${box} ${box}`} width={box}>
        <circle
          cx={box / 2}
          cy={box / 2}
          fill="none"
          r={r}
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={box / 2}
          cy={box / 2}
          fill="none"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          strokeLinecap="round"
          strokeWidth={stroke}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-dashoffset 0.4s",
          }}
        />
      </svg>
      {showValue && (
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-bold"
          data-testid={ProgressRingTestId.Value}
          style={{ fontSize: font, color }}
        >
          {Math.round(pct)}
        </span>
      )}
    </span>
  );
}
