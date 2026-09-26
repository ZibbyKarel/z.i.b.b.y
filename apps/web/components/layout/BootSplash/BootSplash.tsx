"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Splash } from "@zibby/design-system";

export interface BootSplashProps {
  children: ReactNode;
}

/**
 * Shows the DS `Splash` boot choreography once per page load, then fades it out
 * the moment the app is ready. The app renders underneath the whole time, so it
 * warms up while the sequence plays. Within the SPA the splash never replays —
 * it only re-runs on a full reload.
 *
 * `Splash` owns its own minimum-visible timing (the walk → reveal → settle
 * phases play out in full before it's even eligible to exit on `ready`), so
 * this wrapper only tracks readiness and unmounts once `Splash` reports its
 * exit fade is done (`onDone`) — it never re-intercepts clicks after that.
 *
 * Today "ready" is hydration (essentially immediate — the `Splash` choreography
 * itself dominates how long the screen shows), but the signal can later be
 * swapped for a slower one (initial data settled, etc.) without touching the
 * rest of the flow.
 */
export function BootSplash({ children }: BootSplashProps) {
  const t = useTranslations();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      {children}
      {visible && (
        <Splash
          onDone={() => setVisible(false)}
          ready={ready}
          status={t("common.loading")}
          tagline={t("loading.tagline")}
          wordmark="Z.I.B.B.Y"
        />
      )}
    </>
  );
}
