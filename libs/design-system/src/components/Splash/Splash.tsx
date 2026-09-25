"use client";
import type { Ref } from "react";
import { useEffect, useRef, useState } from "react";
import type { StateTone } from "../../stateTone";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
import { Typography } from "../Typography/Typography";
import { Wordmark } from "../Wordmark/Wordmark";

export enum SplashTestId {
  Root = "splash-root",
  Panel = "splash-panel",
  Glyph = "splash-glyph",
  Wordmark = "splash-wordmark",
  Tagline = "splash-tagline",
  Status = "splash-status",
}

/** The boot choreography's discrete stages — `"done"` means unmounted (the
 *  component renders `null` from there on). */
export type SplashPhase = "walk" | "reveal" | "settled" | "exit" | "done";

/** Glyph walks in, `working`. */
export const SPLASH_WALK_MS = 900;
/** Wordmark reveals, glyph settles to `thinking`. */
export const SPLASH_REVEAL_MS = 500;
/** Exit fade once `ready` — pointer-events are already `none` throughout it. */
export const SPLASH_EXIT_MS = 320;

const PHASE_GLYPH_STATE: Record<Exclude<SplashPhase, "done">, StateTone> = {
  walk: "working",
  reveal: "thinking",
  settled: "idle",
  exit: "done",
};

/** Defensive by design (mirrors `DesignSystemProvider`'s `matchMedia` guard):
 *  `window.matchMedia` is absent in SSR and throws "not implemented" in some
 *  jsdom versions — never let a motion-preference read crash the splash. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface SplashProps {
  /** Flips true once the app has finished loading. It only gates the exit
   *  fade — the boot choreography itself always plays in full (a minimum
   *  splash time) unless the operator prefers reduced motion. */
  ready: boolean;
  /** Fires once the exit fade completes. From that point the component
   *  renders nothing — it never re-intercepts clicks, even if the caller is
   *  slow to remove it from the tree. */
  onDone?: () => void;
  /** Brand text — passed through to `Wordmark`. */
  wordmark?: string;
  /** Sub-line under the wordmark. */
  tagline?: string;
  /** Status line while booting. */
  status?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The choreographed boot screen (`ZibbyCorp Splash.dc.html`): a glyph walk,
 * then the wordmark reveal, then a hold until `ready`, then an exit fade.
 * Ports `apps/web/components/LoadingScreen/*` onto the ZibbyCorp visual
 * language (deleted in ZA-07 once the app is wired to this instead).
 *
 * The phase machine is driven entirely by `setTimeout`s against the exported
 * `SPLASH_*_MS` constants — deterministic and advance-able with fake timers,
 * no `requestAnimationFrame` physics loop. Reduced motion mounts straight
 * into `"settled"` and fades out instantly once `ready`.
 */
export function Splash({
  ready,
  onDone,
  wordmark,
  tagline = "Agent operations console",
  status = "Booting",
  ref,
}: SplashProps) {
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const [phase, setPhase] = useState<SplashPhase>(reducedMotion ? "settled" : "walk");

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (reducedMotion || phase !== "walk") return;
    const t = setTimeout(() => setPhase("reveal"), SPLASH_WALK_MS);
    return () => clearTimeout(t);
  }, [reducedMotion, phase]);

  useEffect(() => {
    if (reducedMotion || phase !== "reveal") return;
    const t = setTimeout(() => setPhase("settled"), SPLASH_REVEAL_MS);
    return () => clearTimeout(t);
  }, [reducedMotion, phase]);

  // The choreography never cuts short: the exit only fires once settled
  // (naturally, or immediately under reduced motion) AND `ready`.
  useEffect(() => {
    if (phase !== "settled" || !ready) return;
    setPhase("exit");
  }, [phase, ready]);

  useEffect(() => {
    if (phase !== "exit") return;
    const ms = reducedMotion ? 0 : SPLASH_EXIT_MS;
    const t = setTimeout(() => {
      setPhase("done");
      onDoneRef.current?.();
    }, ms);
    return () => clearTimeout(t);
  }, [reducedMotion, phase]);

  if (phase === "done") return null;

  const exiting = phase === "exit";
  const showWordmark = phase === "reveal" || phase === "settled" || phase === "exit";

  return (
    <div
      aria-busy={!exiting}
      aria-label={status}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background font-mono text-ink"
      data-phase={phase}
      data-testid={SplashTestId.Root}
      ref={ref}
      role="status"
      style={{
        backgroundImage:
          "linear-gradient(var(--color-grid) 1px, transparent 1px)," +
          "linear-gradient(90deg, var(--color-grid) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        opacity: exiting ? 0 : 1,
        pointerEvents: exiting ? "none" : undefined,
        transitionDuration: reducedMotion ? "0ms" : `${SPLASH_EXIT_MS}ms`,
        transitionProperty: "opacity",
      }}
    >
      <div
        className="relative flex flex-col items-center gap-3 border border-ink bg-panel px-10 py-9"
        data-testid={SplashTestId.Panel}
      >
        <div data-testid={SplashTestId.Glyph}>
          <AgentGlyph seed="Zibby" size={48} state={PHASE_GLYPH_STATE[phase]} />
        </div>

        <div
          className="flex flex-col items-center gap-2"
          style={{
            opacity: showWordmark ? 1 : 0,
            transitionDuration: reducedMotion ? "0ms" : `${SPLASH_REVEAL_MS}ms`,
            transitionProperty: "opacity",
          }}
        >
          <div data-testid={SplashTestId.Wordmark}>
            <Wordmark>{wordmark}</Wordmark>
          </div>
          {tagline && (
            <Typography
              data-testid={SplashTestId.Tagline}
              tracking="wider"
              type="labelSm"
              variant="tertiary"
            >
              {tagline}
            </Typography>
          )}
        </div>

        <Typography data-testid={SplashTestId.Status} tracking="wider" type="labelSm" variant="secondary">
          {status}
        </Typography>
      </div>
    </div>
  );
}
