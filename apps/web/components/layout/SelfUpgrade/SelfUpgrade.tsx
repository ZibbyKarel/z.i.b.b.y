"use client";

import { Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSelfStatusQuery } from "../../../features/self";

declare global {
  interface Window {
    /** ZibbyOS.app's preload bridge (apps/desktop/src/preload.ts); absent in a plain browser. */
    zibbyDesktop?: { checkForUpdates(): Promise<void>; installUpdate(): Promise<void> };
  }
}

export enum SelfUpgradeTestId {
  Button = "self-upgrade-button",
}

/**
 * Header Upgrade icon button next to the limits — shown only when a newer
 * `desktop-v*` GitHub release exists than the running ZibbyOS.app
 * (`appUpdateAvailable` on the self status). In the app it runs the same updater
 * as the menu's "Check for Updates…" (via the preload bridge); in a plain browser
 * it opens the release page in a new tab. The button shows its loading state
 * (and ignores clicks) until the desktop updater call settles.
 */
export function SelfUpgrade() {
  const t = useTranslations("shell.selfUpgrade");
  const { data: status } = useSelfStatusQuery();
  const [pending, setPending] = useState(false);

  if (!status?.appUpdateAvailable) return null;

  const label = t("aria", { version: `v${status.latestAppVersion ?? ""}` });
  const handleClick = () => {
    if (window.zibbyDesktop) {
      setPending(true);
      void window.zibbyDesktop
        .checkForUpdates()
        .catch(() => undefined)
        .finally(() => setPending(false));
    } else if (status.latestAppReleaseUrl) {
      window.open(status.latestAppReleaseUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Button
      aria-label={label}
      data-testid={SelfUpgradeTestId.Button}
      icon="upgrade"
      intent="primary"
      loading={pending}
      onClick={handleClick}
      size="sm"
      title={label}
    />
  );
}
