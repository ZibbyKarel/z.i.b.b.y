"use client";

import { Button, Container, Row, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useNow } from "../../../hooks/useNow";
import { useSyncInboxMutation } from "../mutations";
import { useElapsedLabel } from "../useElapsedLabel";

export enum InboxHeaderTestId {
  Root = "inbox-header",
  Title = "inbox-header-title",
  Sync = "inbox-header-sync",
  SyncedAt = "inbox-header-synced-at",
}

export type InboxView = "overview" | "issues" | "prs";

export interface InboxHeaderProps {
  view: InboxView;
  /** Projects the `Sync` button syncs (`InboxItemsResponse.syncProjectIds`). */
  syncProjectIds?: string[] | undefined;
  /** Oldest last-sync across those projects. */
  syncedAt?: string | undefined;
}

/**
 * The shared Inbox page header (spec "Information architecture"): a mono kicker,
 * the title, "Synced N min ago" and the `Sync` button — the existing per-project
 * roadmap sync for every integrated project.
 */
export function InboxHeader({ view, syncProjectIds, syncedAt }: InboxHeaderProps) {
  const t = useTranslations("inboxPage");
  const now = useNow(30_000);
  const elapsedLabel = useElapsedLabel();
  const sync = useSyncInboxMutation();
  const canSync = (syncProjectIds?.length ?? 0) > 0;

  return (
    <Row wrap data-testid={InboxHeaderTestId.Root} gap="200" justify="between">
      <Stack gap="75">
        <Typography type="label">{t(`kicker.${view}`)}</Typography>
        <Typography data-testid={InboxHeaderTestId.Title} type="h1">
          {t(`title.${view}`)}
        </Typography>
      </Stack>
      {
        <Row gap="150">
          <Row gap="100">
            <StatusDot pulse={sync.isPending} tone={sync.isPending ? "working" : "idle"} />
            <Typography data-testid={InboxHeaderTestId.SyncedAt} type="label">
              {sync.isPending
                ? t("sync.syncing")
                : syncedAt
                  ? t("sync.at", { when: elapsedLabel(syncedAt, now) })
                  : t("sync.never")}
            </Typography>
          </Row>
          <Container shrink={false}>
            <Button
              data-testid={InboxHeaderTestId.Sync}
              disabled={!canSync || sync.isPending}
              intent="secondary"
              loading={sync.isPending}
              onClick={() => sync.mutate(syncProjectIds ?? [])}
              size="sm"
            >
              {t("sync.button")}
            </Button>
          </Container>
        </Row>
      }
    </Row>
  );
}
