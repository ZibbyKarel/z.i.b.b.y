"use client";

import { type ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { LoadingScreen } from "../../LoadingScreen/LoadingScreen";

/** Crossfade duration (ms) after `done` flips, before the splash unmounts. */
const FADE_MS = 600;

export interface BootSplashProps {
  children: ReactNode;
  /**
   * Minimum time (ms) the splash stays on screen before it is allowed to fade,
   * even if the app becomes ready sooner. Because the app is already hydrated by
   * the time the splash mounts, this floor effectively governs how long it shows
   * — it exists to avoid a jarring flash on fast loads. Raise it for a longer
   * boot animation, lower it to get out of the way faster.
   */
  minVisibleMs?: number;
}

/**
 * Shows the animated boot splash once per page load, then fades it out the moment
 * the app is ready. The app renders underneath the whole time, so it warms up
 * while the sequence plays. Within the SPA the splash never replays — it only
 * re-runs on a full reload.
 *
 * Readiness and the minimum-visible floor are tracked separately: the splash
 * fades as soon as BOTH are satisfied. Today "ready" is hydration (essentially
 * immediate, so {@link BootSplashProps.minVisibleMs} dominates), but the `ready`
 * signal can later be swapped for a slower one (initial data settled, etc.)
 * without touching the rest of the flow.
 */
export function BootSplash({ children, minVisibleMs = 600 }: BootSplashProps) {
  const t = useTranslations();
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    // The app is hydrated/interactive the moment this effect runs, so it's ready
    // right away — the min-visible floor governs how long the splash shows. Swap
    // this for a slower check (e.g. initial data settled, read off a ref) and the
    // per-frame poll below will fade the splash the instant it flips true.
    const isReady = () => true;

    // Animate progress across the min-visible window (ease-out: sprints early,
    // settles near the end) so the bar never looks stuck. Once the floor has
    // elapsed AND the app is ready, snap to 100%, fade, then unmount.
    const tick = () => {
      const ratio = Math.min((performance.now() - start) / minVisibleMs, 1);
      if (ratio >= 1 && isReady()) {
        setProgress(100);
        setDone(true);
        hideTimer = setTimeout(() => setVisible(false), FADE_MS);
        return;
      }
      setProgress(Math.round((1 - (1 - ratio) ** 2) * 100));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [minVisibleMs]);

  return (
    <>
      {children}
      {visible && (
        <LoadingScreen
          done={done}
          logo={
            <Image
              priority
              alt="ZIBBY"
              height={220}
              src="/z.i.b.b.y.png"
              style={{ height: "100%", objectFit: "cover", width: "100%" }}
              width={220}
            />
          }
          progress={progress}
          status={t("common.loading")}
          tagline={t("loading.tagline")}
          version={t("loading.version")}
          wordmark="Z.I.B.B.Y"
        />
      )}
    </>
  );
}
