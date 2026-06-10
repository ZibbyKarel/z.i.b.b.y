/* eslint-disable react/forbid-dom-props -- This brand boot splash is built from
   per-element decorative inline styles (accent-tinted HUD brackets, orbit insets,
   ripple glows, SVG trace dash/animation values). Every one is a genuinely dynamic
   or brand-specific value with no DS prop equivalent, so it uses the sanctioned
   style escape hatch on raw DOM/SVG nodes — file-level rather than 18 per-line. */
import type { CSSProperties, ReactNode, Ref } from "react";
import { Progress, cn } from "@zibby/design-system";

export enum LoadingScreenTestId {
  Root = "loading-screen-root",
  Logo = "loading-screen-logo",
  Wordmark = "loading-screen-wordmark",
  Tagline = "loading-screen-tagline",
  Progress = "loading-screen-progress",
  Status = "loading-screen-status",
  Version = "loading-screen-version",
}

export interface LoadingScreenProps {
  /** The glowing brand mark — rendered inside the breathing, circular halo. */
  logo: ReactNode;
  /** Wordmark text; each character animates in. Dots render in the accent tone. */
  wordmark?: string;
  /** Sub-line under the wordmark. */
  tagline?: string;
  /** Bottom-right build badge. */
  version?: string;
  /** Boot progress, 0–100. */
  progress: number;
  /** Single-line status under the bar; re-keys to fade on change. */
  status?: string;
  /** When true, the whole screen plays its exit fade. */
  done?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const ACCENT = "rgba(91,141,239,1)";

const radialGlow: CSSProperties = {
  background:
    "radial-gradient(ellipse 60% 60% at 50% 52%, rgba(91,141,239,0.07) 0%, transparent 70%)",
};

const scanlines: CSSProperties = {
  background:
    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
};

const TICKS = 20;

/** Corner HUD bracket. */
function Corner({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed h-10 w-10 opacity-25"
      style={style}
    />
  );
}

/**
 * Full-screen boot / loading splash — a glowing brand mark inside an orbiting
 * HUD ring, an animated wordmark, a glowing progress bar and a rotating status
 * line. Presentational: the caller drives `progress`/`status` and flips `done`
 * to trigger the exit fade.
 */
export function LoadingScreen({
  logo,
  wordmark = "Z.I.B.B.Y",
  tagline,
  version,
  progress,
  status,
  done = false,
  ref,
}: LoadingScreenProps) {
  const pct = Math.max(0, Math.min(100, progress));
  const chars = [...wordmark];

  return (
    <div
      aria-busy={!done}
      aria-label={status ?? "Loading"}
      className={cn(
        "fixed inset-0 z-50 overflow-hidden bg-background font-mono text-foreground",
        done && "animate-screen-out",
      )}
      data-testid={LoadingScreenTestId.Root}
      ref={ref}
      role="status"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={radialGlow} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[100]" style={scanlines} />

      <Corner style={{ top: 24, left: 24, borderTop: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }} />
      <Corner style={{ top: 24, right: 24, borderTop: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }} />
      <Corner style={{ bottom: 24, left: 24, borderBottom: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }} />
      <Corner style={{ bottom: 24, right: 24, borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }} />

      {version && (
        <div
          className="animate-fade-up fixed text-[9px] tracking-[0.14em] opacity-0"
          data-testid={LoadingScreenTestId.Version}
          style={{ bottom: 32, right: 32, color: "#3a4a5a", animationDelay: "2.2s" }}
        >
          {version}
        </div>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Brand mark + orbiting HUD */}
        <div className="relative mb-11 flex h-[220px] w-[220px] items-center justify-center">
          <CircuitTraces />
          <div className="animate-ripple absolute inset-0 rounded-full" style={{ background: "rgba(91,141,239,0.08)" }} />
          <div className="animate-ripple absolute inset-0 rounded-full" style={{ background: "rgba(91,141,239,0.05)", animationDelay: "1.4s" }} />
          <div
            className="animate-ring-pulse absolute rounded-full"
            style={{ inset: -28, border: "1px solid rgba(91,141,239,0.12)", animationDelay: "0.7s" }}
          />
          <div
            className="animate-ring-pulse absolute rounded-full"
            style={{ inset: -10, border: "1.5px solid rgba(91,141,239,0.3)" }}
          />
          <div className="animate-orbit-spin absolute rounded-full" style={{ inset: -22, border: "1px solid rgba(91,141,239,0.18)" }}>
            <div
              className="absolute left-1/2 rounded-full"
              style={{
                top: -3.5,
                height: 7,
                width: 7,
                marginLeft: -3.5,
                background: ACCENT,
                boxShadow: "0 0 12px 4px rgba(91,141,239,0.7)",
              }}
            />
          </div>
          <div
            className="animate-logo-breathe h-[220px] w-[220px] overflow-hidden rounded-full"
            data-testid={LoadingScreenTestId.Logo}
          >
            {logo}
          </div>
        </div>

        {/* Wordmark */}
        <div
          className="mb-2 text-center text-[28px] font-bold tracking-[0.32em]"
          data-testid={LoadingScreenTestId.Wordmark}
        >
          {chars.map((ch, i) => {
            const isDot = ch === ".";
            return (
              <span
                className="animate-letter-in inline-block opacity-0"
                key={`${ch}-${i}`}
                style={{
                  transform: "translateY(6px)",
                  animationDelay: `${0.1 + i * 0.09}s`,
                  ...(isDot ? { color: ACCENT, letterSpacing: 0 } : null),
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* Tagline */}
        {tagline && (
          <div
            className="animate-fade-up mb-[52px] text-[10px] uppercase tracking-[0.22em] opacity-0"
            data-testid={LoadingScreenTestId.Tagline}
            style={{ color: "var(--color-foreground-faint)", animationDelay: "1.6s" }}
          >
            {tagline}
          </div>
        )}

        {/* Progress */}
        <div className="animate-fade-up mb-4 w-[260px] opacity-0" style={{ animationDelay: "1.8s" }}>
          <div className="relative" data-testid={LoadingScreenTestId.Progress}>
            <Progress glow height="25" label={status ?? "Loading"} value={pct} />
            {/* Bright leading-edge node riding the fill */}
            <div
              aria-hidden="true"
              className="absolute top-1/2 rounded-full"
              style={{
                left: `${pct}%`,
                height: 8,
                width: 8,
                marginLeft: -4,
                marginTop: -4,
                background: "#7eb0ff",
                boxShadow: "0 0 10px 3px rgba(91,141,239,0.9)",
                transition: "left 0.12s linear",
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between">
            {Array.from({ length: TICKS }, (_, i) => (
              <span
                className="block h-1 w-px"
                key={`tick-${i}`}
                style={{ background: "rgba(255,255,255,0.1)" }}
              />
            ))}
          </div>
        </div>

        {/* Status */}
        <div
          className="animate-fade-up h-4 min-w-[260px] overflow-hidden text-center text-[10px] tracking-[0.12em] text-accent opacity-0"
          style={{ animationDelay: "2s" }}
        >
          {status && (
            <span
              className="animate-status-in inline-block"
              data-testid={LoadingScreenTestId.Status}
              key={status}
            >
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Decorative circuit-board traces radiating from the brand mark. */
function CircuitTraces() {
  const traceBase: CSSProperties = {
    stroke: ACCENT,
    strokeWidth: 1,
    fill: "none",
    filter: "url(#loading-glow)",
    opacity: 0.7,
  };
  const traces = [
    { d: "M 430 500 H 330 V 440 H 250 V 380", len: 160, dur: 1.2, delay: 0.3 },
    { d: "M 430 510 H 310 V 560 H 220 V 620", len: 200, dur: 1.4, delay: 0.5 },
    { d: "M 570 490 H 680 V 430 H 760 V 370", len: 220, dur: 1.3, delay: 0.4 },
    { d: "M 575 515 H 690 V 570 H 790 V 640", len: 180, dur: 1.5, delay: 0.6 },
    { d: "M 495 360 V 290 H 560 V 230", len: 130, dur: 1.1, delay: 0.7 },
    { d: "M 510 358 V 260 H 440 V 200", len: 170, dur: 1.3, delay: 0.35 },
    { d: "M 495 645 V 720 H 580 V 780", len: 150, dur: 1.2, delay: 0.8 },
    { d: "M 508 648 V 730 H 420 V 810", len: 190, dur: 1.4, delay: 0.55 },
  ];
  const nodes = [
    { cx: 250, cy: 380, delay: 1.5 },
    { cx: 220, cy: 620, delay: 1.7 },
    { cx: 760, cy: 370, delay: 1.9 },
    { cx: 790, cy: 640, delay: 1.6 },
    { cx: 560, cy: 230, delay: 1.8 },
    { cx: 440, cy: 200, delay: 2.0 },
  ];

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute opacity-55"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100vw", height: "100vh", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
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
          style={{ fill: ACCENT, opacity: 0, animation: `node-appear 0.3s ease forwards ${n.delay}s` }}
        />
      ))}
    </svg>
  );
}
