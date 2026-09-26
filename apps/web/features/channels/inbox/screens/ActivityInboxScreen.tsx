"use client";

import type { ChannelItem, ChannelItemState } from "@zibby/contracts";
import {
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { QueryError } from "../../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../../components/LoadingState/QueryLoading";
import { useChannelItemsQuery } from "../../../integrations/queries";

/** Display tone for each item state — the single source for the inbox chip
 * (mirrors `InboxPanel`'s mapping). */
const STATE_TONE: Record<ChannelItemState, "neutral" | "ok" | "warn" | "bad"> = {
  new: "neutral",
  "needs-draft": "warn",
  triaged: "warn",
  handled: "ok",
  ignored: "bad",
};

/** Autonomy-contract tier → chip tone, escalating: 1 act-silently, 2
 * act-then-report, 3 surface-and-wait. */
const TIER_TONE: Record<1 | 2 | 3, "ok" | "accent" | "warn"> = {
  1: "ok",
  2: "accent",
  3: "warn",
};

/**
 * `/activity/inbox` (ZB-07) — inbound channel items (mine-and-mentions):
 * source, sender, tier, handling and the triage outcome, as a `DataTable`. Text
 * stays truncated per Law 4 (inbound content is data, never rendered as more
 * than a preview). Read-only — reuses `useChannelItemsQuery`, the same feed
 * `InboxPanel` (Overview/project detail) already reads.
 */
export function ActivityInboxScreen() {
  const t = useTranslations();
  const { data: items = [], isPending, isError, refetch } = useChannelItemsQuery();
  const sorted = [...items].reverse();

  const columns: DataTableColumn<ChannelItem>[] = [
    {
      key: "source",
      label: t("activityInbox.column.source"),
      width: "sm",
      render: (row) => (
        <Typography mono size="xs" type="note" variant="tertiary">
          {row.integrationId}
        </Typography>
      ),
    },
    {
      key: "sender",
      label: t("activityInbox.column.sender"),
      width: "sm",
      render: (row) => (
        <Typography truncate size="sm" type="note" variant="secondary">
          {row.from ?? "—"}
        </Typography>
      ),
    },
    {
      key: "tier",
      label: t("activityInbox.column.tier"),
      width: "xs",
      render: (row) =>
        row.triage ? (
          <Tag tone={TIER_TONE[row.triage.tier]}>{t("inbox.tier", { n: row.triage.tier })}</Tag>
        ) : (
          "—"
        ),
    },
    {
      key: "handling",
      label: t("activityInbox.column.handling"),
      width: "sm",
      render: (row) => (
        <Stack wrap direction="row" gap="75">
          <Tag tone={STATE_TONE[row.state]}>{t(`inbox.state.${row.state}`)}</Tag>
          {row.taskId && <Tag tone="accent">{t("inbox.dispatched")}</Tag>}
          {row.reply && <Tag tone="ok">{t("inbox.replied")}</Tag>}
        </Stack>
      ),
    },
    {
      key: "triage",
      label: t("activityInbox.column.triage"),
      width: "sm",
      render: (row) =>
        row.triage ? (
          <Typography size="sm" type="note" variant="secondary">
            {t(`inbox.category.${row.triage.category}`)}
          </Typography>
        ) : (
          "—"
        ),
    },
    {
      key: "text",
      label: t("activityInbox.column.text"),
      width: "flex",
      // Law 4: inbound content is data, never a command — truncated to a preview.
      render: (row) => (
        <Container minW0 maxWidth="420px">
          <Typography truncate size="sm" type="note" variant="tertiary">
            {row.text}
          </Typography>
        </Container>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("activityInbox.eyebrow")}
          </Typography>
          <Typography type="h1">{t("activityInbox.title")}</Typography>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <DataTable
            columns={columns}
            empty={
              <EmptyState
                body={t("activityInbox.emptyBody")}
                title={t("activityInbox.emptyTitle")}
              />
            }
            getRowKey={(row) => row.id}
            rows={sorted}
          />
        )}
      </Stack>
    </Container>
  );
}
