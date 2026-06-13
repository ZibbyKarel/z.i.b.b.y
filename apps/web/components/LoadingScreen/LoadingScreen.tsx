/* eslint-disable react/forbid-dom-props -- This brand boot splash uses decorative inline styles (radial glow, scanlines, tagline colour, version badge insets/colour). Every value is genuinely dynamic or brand-specific with no DS prop equivalent — file-level rather than per-line. */
import type { ReactNode, Ref } from "react";
import { cn } from "@zibby/design-system";
import { ACCENT, radialGlow, scanlines } from "./constants";
import { Corner } from "./Corner";
import { CircuitTraces } from "./CircuitTraces";
import { BrandMark } from "./BrandMark";
import { Wordmark } from "./Wordmark";
import { BootProgress } from "./BootProgress";
import { StatusLine } from "./StatusLine";

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
        <CircuitTraces />
        <BrandMark logo={logo} testId={LoadingScreenTestId.Logo} />

        <Wordmark testId={LoadingScreenTestId.Wordmark} wordmark={wordmark} />

        {tagline && (
          <div
            className="animate-fade-up mb-[52px] text-[10px] uppercase tracking-[0.22em] opacity-0"
            data-testid={LoadingScreenTestId.Tagline}
            style={{ color: "var(--color-foreground-faint)", animationDelay: "1.6s" }}
          >
            {tagline}
          </div>
        )}

        <BootProgress pct={pct} status={status} testId={LoadingScreenTestId.Progress} />

        <StatusLine status={status} testId={LoadingScreenTestId.Status} />
      </div>
    </div>
  );
}
