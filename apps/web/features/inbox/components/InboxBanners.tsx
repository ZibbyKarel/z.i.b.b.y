"use client";

import type { InboxSourceError } from "@zibby/contracts";
import { Alert, Stack, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useProjectsQuery } from "../../projects";
import { NavLink } from "./links";

export enum InboxBannersTestId {
  Banner = "inbox-banner",
}

/**
 * Non-blocking "Jira sync failed for <project>: …" banners (spec "States"): one
 * dismissible `Alert` per failing integration while the rest of the page keeps
 * rendering from the last synced state.
 */
export function InboxBanners({ errors }: { errors: InboxSourceError[] }) {
  const t = useTranslations("inboxPage");
  const { data: projects } = useProjectsQuery();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const seen = new Set<string>();
  const visible = errors.filter((e) => {
    const key = `${e.projectId}:${e.source}`;
    if (dismissed.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (visible.length === 0) return null;

  return (
    <Stack gap="100">
      {visible.map((error) => {
        const key = `${error.projectId}:${error.source}`;
        const project = projects?.find((p) => p.id === error.projectId)?.name ?? error.projectId;
        return (
          <Alert
            data-testid={`${InboxBannersTestId.Banner}-${key}`}
            key={key}
            onClose={() => setDismissed((prev) => new Set(prev).add(key))}
            severity="warn"
            title={t("banner.title", { source: t(`source.${error.source}`), project })}
          >
            <Stack gap="50">
              <Typography type="bodySm">{error.message}</Typography>
              <TextLink href={`/projects/${error.projectId}`} linkComponent={NavLink}>
                <Typography uppercase size="2xs" type="note">
                  {t("banner.reconnect")}
                </Typography>
              </TextLink>
            </Stack>
          </Alert>
        );
      })}
    </Stack>
  );
}
