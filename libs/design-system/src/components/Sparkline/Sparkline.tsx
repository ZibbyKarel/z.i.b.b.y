import type { SVGProps } from "react"

export interface SparklineProps extends Omit<SVGProps<SVGSVGElement>, "points"> {
  /** Series values. */
  data: number[]
  /** Stroke color (defaults to the active accent). */
  color?: string
  width?: number
  height?: number
  ref?: React.Ref<SVGSVGElement>
}

/** A tiny filled trend line — used by the Agent SDK 14-day spend widget. */
export function Sparkline({
  data,
  color = "rgb(var(--zb-accent))",
  width = 260,
  height = 40,
  ref,
  ...props
}: SparklineProps) {
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
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      aria-hidden="true"
      {...props}
    >
      <polyline
        points={`0,${height} ${line} ${width},${height}`}
        fill={color}
        opacity="0.08"
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
