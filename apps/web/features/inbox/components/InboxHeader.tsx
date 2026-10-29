"use client";

import { Button, Container, Row, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useNow } from "../../../hooks/useNow";
import { useRefreshInboxMutation } from "../mutations";
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
  /** Projects with an issue integration (`InboxItemsResponse.syncProjectIds`); `Sync` is disabled without any. */
  syncProjectIds?: string[] | undefined;
  /** When the issue list was last fetched. */
  syncedAt?: string | undefined;
}

/**
 * The shared Inbox page header (spec "Information architecture"): a mono kicker,
 * the title, "Synced N min ago" and the `Sync` button, which refetches the live
 * issue and PR lists past the API cache.
 */
export function InboxHeader({ view, syncProjectIds, syncedAt }: InboxHeaderProps) {
  const t = useTranslations("inboxPage");
  const now = useNow(30_000);
  const elapsedLabel = useElapsedLabel();
  const sync = useRefreshInboxMutation();
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
              onClick={() => sync.mutate()}
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
