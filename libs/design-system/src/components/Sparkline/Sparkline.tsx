import type { SVGProps } from "react";
import type { ProgressTone } from "../Progress/Progress";

export enum SparklineTestId {
  Root = "sparkline-root",
  Area = "sparkline-area",
  Line = "sparkline-line",
}

const toneVar: Record<ProgressTone, string> = {
  accent: "var(--color-accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  run: "var(--color-run)",
};

export interface SparklineProps extends Omit<
  SVGProps<SVGSVGElement>,
  "points" | "className" | "width" | "height" | "color"
> {
  /** Series values. */
  data: number[];
  /** Line/fill tone — matches the sibling gauges' tone vocabulary. */
  tone?: ProgressTone;
  ref?: React.Ref<SVGSVGElement>;
}

const VIEW_W = 260;
const VIEW_H = 40;

/** A tiny filled trend line — used by the Agent SDK 14-day spend widget. */
export function Sparkline({ data, tone = "accent", ref, ...props }: SparklineProps) {
  const color = toneVar[tone];
  const width = VIEW_W;
  const height = VIEW_H;
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  return (
    <svg
      aria-hidden="true"
      className="block w-full"
      data-testid={SparklineTestId.Root}
      height={height}
      preserveAspectRatio="none"
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      {...props}
    >
      <polyline
        data-testid={SparklineTestId.Area}
        fill={color}
        opacity="0.08"
        points={`0,${height} ${line} ${width},${height}`}
        stroke="none"
      />
      <polyline
        data-testid={SparklineTestId.Line}
        fill="none"
        points={line}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
