"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { SkillSource } from "@zibby/contracts";
import { Stack, Tag, Typography } from "@zibby/design-system";

export enum ExternalSkillSourceTestId {
  Owner = "external-skill-source-owner",
  Updated = "external-skill-source-updated",
  UpdateBadge = "external-skill-source-update-badge",
  Error = "external-skill-source-error",
}

export interface ExternalSkillSourceProps {
  source: SkillSource;
}

/**
 * Provenance line of a skill installed from GitHub: the repo owner, when it was
 * last updated (relative), an "update available" badge when the last check saw a
 * newer commit, and the last sync error as a warning line.
 */
export function ExternalSkillSource({ source }: ExternalSkillSourceProps) {
  const t = useTranslations("skills.external");
  const format = useFormatter();
  // Lazy: Date.now() in render is lint-banned.
  const [now] = useState(() => Date.now());
  const hasUpdate = Boolean(source.latestSha && source.latestSha !== source.sha);

  return (
    <Stack gap="25">
      <Stack wrap align="center" direction="row" gap="75">
        <Typography
          mono
          data-testid={ExternalSkillSourceTestId.Owner}
          size="xs"
          title={t("owner")}
          type="note"
        >
          {source.owner}
        </Typography>
        <Typography
          mono
          data-testid={ExternalSkillSourceTestId.Updated}
          size="xs"
          type="note"
          variant="tertiary"
        >
          {t("updated", { when: format.relativeTime(new Date(source.updatedAt), now) })}
        </Typography>
        {hasUpdate && (
          <Tag data-testid={ExternalSkillSourceTestId.UpdateBadge} size="sm" tone="accent">
            {t("updateAvailable")}
          </Tag>
        )}
      </Stack>
      {source.lastError && (
        <Typography data-testid={ExternalSkillSourceTestId.Error} size="xs" tone="warn" type="note">
          {source.lastError}
        </Typography>
      )}
    </Stack>
  );
}
