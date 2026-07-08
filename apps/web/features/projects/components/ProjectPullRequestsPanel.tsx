"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProjectPr } from "@zibby/contracts";
import { Button, Stack, Tag, Typography } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useMergeProjectPrMutation } from "../mutations";
import { useProjectPrsQuery, useResolvedProjectQuery } from "../queries";

export enum ProjectPullRequestsPanelTestId {
  Empty = "project-prs-empty",
  Row = "project-pr-row",
  MergeButton = "project-pr-merge",
}

export interface ProjectPullRequestsPanelProps {
  projectId: string;
}

export enum ProjectPrCountBadgeTestId {
  Badge = "project-pr-count-badge",
}

export interface ProjectPrCountBadgeProps {
  projectId: string;
}

/**
 * Open-PR count badge for the project detail header (Phase 78's "count badge on
 * the detail panel's header" decision — see {@link ProjectPullRequestsPanel}'s
 * doc comment for why `ProjectCard` does NOT get a matching per-card badge).
 * Renders nothing at zero, the same "state, not noise" convention as
 * `ProjectCiStatusChip`. Shares `useProjectPrsQuery`'s cache key with the panel
 * below it on the same screen, so mounting both costs exactly one polled
 * request, not two.
 */
export function ProjectPrCountBadge({ projectId }: ProjectPrCountBadgeProps) {
  const t = useTranslations("projects.prs");
  const { data } = useProjectPrsQuery(projectId, { enabled: Boolean(projectId) });
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Tag data-testid={ProjectPrCountBadgeTestId.Badge} icon="branch" tone="accent">
      {t("count", { count })}
    </Tag>
  );
}

/**
 * Phase 78 — the open-PR overview on the project detail: every open PR on the
 * project's linked GitHub repo, each with a "Sloučit" (merge) button. Merge is
 * Tier-3 (CLAUDE.md "surface and wait" / Law "Never: Auto-merge") — the button
 * only ever opens a mandatory confirm dialog naming the PR number and warning
 * the merge is hard to undo; `useMergeProjectPrMutation` fires only from that
 * dialog's `onConfirm`, never on its own.
 *
 * `[]` reads as either "no open PRs" or "no github link" — the API deliberately
 * doesn't distinguish (Phase 78's "never an error page" data-source decision).
 * This panel tells the two apart using the resolved-integrations readout
 * `ProjectCompanyPanel` already fetches on this same screen (identical cache
 * key — `useResolvedProjectQuery` — so this costs no extra request).
 *
 * `ProjectCard` deliberately does NOT get a matching per-card PR-count badge:
 * there is no batch/count endpoint, and a card grid would turn this panel's
 * "one query" into N per-project requests. The count badge lives ONLY on the
 * detail header ({@link ProjectPrCountBadge}, mounted once per screen).
 */
export function ProjectPullRequestsPanel({ projectId }: ProjectPullRequestsPanelProps) {
  const t = useTranslations("projects.prs");
  const tk = useTranslations();
  const prsQuery = useProjectPrsQuery(projectId, { enabled: Boolean(projectId) });
  const resolvedQuery = useResolvedProjectQuery(projectId, { enabled: Boolean(projectId) });
  const merge = useMergeProjectPrMutation();
  const [confirming, setConfirming] = useState<ProjectPr | null>(null);

  const prs = prsQuery.data ?? [];
  const hasGithubLink = (resolvedQuery.data?.integrations ?? []).some((i) => i.kind === "github");

  return (
    <HudPanel title={t("title")}>
      <Stack gap="150">
        {prs.length === 0 ? (
          <Typography
            data-testid={ProjectPullRequestsPanelTestId.Empty}
            size="sm"
            type="note"
            variant="tertiary"
          >
            {hasGithubLink ? t("empty") : t("noGithub")}
          </Typography>
        ) : (
          prs.map((pr) => (
            <Stack
              align="center"
              data-testid={ProjectPullRequestsPanelTestId.Row}
              direction="row"
              gap="150"
              justify="between"
              key={pr.number}
            >
              <Stack gap="25">
                <Stack align="center" direction="row" gap="100">
                  <a href={pr.url} rel="noreferrer" target="_blank">
                    <Typography size="sm" type="text">
                      #{pr.number} {pr.title}
                    </Typography>
                  </a>
                  <Tag tone="ok">{t("open")}</Tag>
                </Stack>
                <Typography size="xs" type="note" variant="tertiary">
                  {[pr.author ? t("author", { name: pr.author }) : null, pr.branch]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Stack>
              <Button
                data-testid={ProjectPullRequestsPanelTestId.MergeButton}
                icon="branch"
                intent="primary"
                onClick={() => setConfirming(pr)}
                size="sm"
              >
                {t("mergeButton")}
              </Button>
            </Stack>
          ))
        )}
      </Stack>

      {confirming && (
        <ConfirmDeleteDialog
          body={t("mergeConfirmBody", { number: confirming.number })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("mergeButton")}
          icon="branch"
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            merge.mutate(
              { params: { id: projectId, number: confirming.number }, body: {} },
              { onSuccess: () => setConfirming(null) },
            )
          }
          pending={merge.isPending}
          title={t("mergeConfirmTitle", { number: confirming.number })}
        />
      )}
    </HudPanel>
  );
}
