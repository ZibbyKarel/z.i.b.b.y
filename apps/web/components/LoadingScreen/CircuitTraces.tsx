/* eslint-disable react/forbid-dom-props -- SVG trace and node elements use dynamic animation values with no DS prop equivalent. */
import type { CSSProperties } from "react";
import { ACCENT, nodes, traces } from "./constants";

export function CircuitTraces() {
  const traceBase: CSSProperties = {
    stroke: ACCENT,
    strokeWidth: 1,
    fill: "none",
    filter: "url(#loading-glow)",
    opacity: 0.7,
  };

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute opacity-55"
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100vw",
        height: "100vh",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
      viewBox="0 0 1000 1000"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="loading-glow">
          <feGaussianBlur result="blur" stdDeviation="2" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {traces.map((tr) => (
        <path
          d={tr.d}
          key={tr.d}
          style={{
            ...traceBase,
            strokeDasharray: tr.len,
            strokeDashoffset: tr.len,
            animation: `draw-trace ${tr.dur}s ease forwards ${tr.delay}s`,
          }}
        />
      ))}
      {nodes.map((n) => (
        <circle
          cx={n.cx}
          cy={n.cy}
          key={`${n.cx}-${n.cy}`}
          r={3.5}
          style={{
            fill: ACCENT,
            opacity: 0,
            animation: `node-appear 0.3s ease forwards ${n.delay}s`,
          }}
        />
      ))}
    </svg>
  );
}
