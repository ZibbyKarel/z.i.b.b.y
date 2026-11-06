"use client";

import { Button, Divider, Panel, Stack, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCheckAppUpdateMutation, useSelfStatusQuery } from "../../self";
import { InfoRow } from "./InfoRow";

export enum UpdatesSectionTestId {
  Root = "updates-section",
  Check = "updates-check",
  Install = "updates-install",
  Available = "updates-available",
  /** Polite live region with the result of the last manual check. */
  Status = "updates-status",
}

/**
 * Settings → General → Updates: the running ZibbyOS version, the newest
 * `desktop-v*` release, and "Check for updates" (forces a fresh GitHub lookup).
 * When an update is out it says so here as well as in the top bar; "Download and
 * install" runs the desktop updater straight away (in a plain browser it opens the
 * release page instead).
 */
export function UpdatesSection() {
  const t = useTranslations("settings.updates");
  const { data: status } = useSelfStatusQuery();
  const check = useCheckAppUpdateMutation();
  const [installing, setInstalling] = useState(false);
  const [checked, setChecked] = useState<"upToDate" | "failed" | null>(null);

  const version = (v: string | undefined) => (v ? `v${v}` : "—");

  const handleCheck = () => {
    setChecked(null);
    check.mutate(
      { body: {} },
      {
        onSuccess: ({ body }) => {
          if (!body.latestAppVersion) setChecked("failed");
          else if (!body.appUpdateAvailable) setChecked("upToDate");
        },
        onError: () => setChecked("failed"),
      },
    );
  };

  const handleInstall = () => {
    if (window.zibbyDesktop) {
      setInstalling(true);
      void window.zibbyDesktop
        .installUpdate()
        .catch(() => undefined)
        .finally(() => setInstalling(false));
    } else if (status?.latestAppReleaseUrl) {
      window.open(status.latestAppReleaseUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Panel data-testid={UpdatesSectionTestId.Root} header={t("title")} padding="300">
      <Stack gap="150">
        <InfoRow label={t("current")} value={version(status?.appVersion)} />
        <Divider />
        <InfoRow label={t("latest")} value={version(status?.latestAppVersion)} />
        {status?.appUpdateAvailable && (
          <>
            <Divider />
            <Stack data-testid={UpdatesSectionTestId.Available} gap="75">
              <Typography tone="warn" type="text" weight="medium">
                {t("available", { version: version(status.latestAppVersion) })}
              </Typography>
              {status.latestAppReleaseUrl && (
                <TextLink href={status.latestAppReleaseUrl} rel="noreferrer" target="_blank">
                  <Typography size="sm" type="note">
                    {t("releaseNotes")}
                  </Typography>
                </TextLink>
              )}
            </Stack>
          </>
        )}
        <Divider />
        <Stack align="center" direction="row" gap="150">
          <Button
            data-testid={UpdatesSectionTestId.Check}
            intent="secondary"
            loading={check.isPending}
            onClick={handleCheck}
            size="sm"
          >
            {t("check")}
          </Button>
          {status?.appUpdateAvailable && (
            <Button
              data-testid={UpdatesSectionTestId.Install}
              icon="upgrade"
              intent="primary"
              loading={installing}
              onClick={handleInstall}
              size="sm"
            >
              {t("install")}
            </Button>
          )}
          <Typography
            aria-live="polite"
            as="span"
            data-testid={UpdatesSectionTestId.Status}
            role="status"
            size="xs"
            tone={checked === "failed" ? "bad" : undefined}
            type="note"
          >
            {checked && t(checked)}
          </Typography>
        </Stack>
      </Stack>
    </Panel>
  );
}
