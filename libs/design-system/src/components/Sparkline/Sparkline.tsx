import type { SVGProps } from "react"

export enum SparklineTestId {
  Root = "sparkline-root",
  Area = "sparkline-area",
  Line = "sparkline-line",
}

export interface SparklineProps extends Omit<SVGProps<SVGSVGElement>, "points" | "className" | "width" | "height"> {
  /** Series values. */
  data: number[]
  /** Stroke color (defaults to the active accent). */
  color?: string
  ref?: React.Ref<SVGSVGElement>
}

const VIEW_W = 260;
const VIEW_H = 40;

/** A tiny filled trend line — used by the Agent SDK 14-day spend widget. */
export function Sparkline({
  data,
  color = "var(--color-accent)",
  ref,
  ...props
}: SparklineProps) {
  const width = VIEW_W;
  const height = VIEW_H;
  if (data.length === 0) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width
    const y = height - ((v - min) / span) * (height - 6) - 3
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = points.join(" ")
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
  )
}
