"use client";

import { BoardGrid, BoardLine, BoardRow, BoardText, IconTile } from "@zibby/design-system";
import type { ChannelItem, IntegrationKind } from "@zibby/contracts";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { sourceIcon } from "../../integrations/kindIcon";
import { useChannelItemsQuery } from "../../integrations/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export const MENTION_KINDS = [
  "jira",
  "github",
  "slack",
  "email",
] as const satisfies readonly IntegrationKind[];
export const MENTIONS_LIMIT = 50;

export enum MentionsWidgetTestId {
  Source = "mentions-widget-source",
  Author = "mentions-widget-author",
  Snippet = "mentions-widget-snippet",
  Age = "mentions-widget-age",
}

/** Conversational channel items, dismissed ones dropped, newest first, capped. */
export function mentionItems(items: readonly ChannelItem[]): ChannelItem[] {
  return items
    .filter(
      (i) =>
        (MENTION_KINDS as readonly IntegrationKind[]).includes(i.kind) && i.state !== "ignored",
    )
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, MENTIONS_LIMIT);
}

/**
 * Mentions: a read-only list of channel items (already "mine and mentions" by ingest) from Jira,
 * GitHub, Slack and email. List only — a row opens its source in a new tab; reply comes later.
 */
export function MentionsWidget({ widget, onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const now = useNow(60_000);
  const query = useChannelItemsQuery();
  const rows = useMemo(() => mentionItems(query.data ?? []), [query.data]);

  useWidgetReport(
    {
      loading: query.isPending,
      count: query.isPending ? undefined : rows.length,
      you: 0,
      failed: query.isError,
    },
    { onEmptyChange, onCountChange },
  );

  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  return (
    <>
      {rows.map((i) => (
        <BoardRow
          key={i.id}
          onClick={i.url ? () => window.open(i.url, "_blank", "noopener,noreferrer") : undefined}
          rowKey={`${widget.id}:${i.id}`}
          tone="neutral"
        >
          <BoardGrid columns="issue">
            <IconTile
              {...sourceIcon(i.kind)}
              alt={i.kind}
              aria-label={i.kind}
              data-testid={MentionsWidgetTestId.Source}
              filled={false}
              radius="sm"
              role="img"
              size="xs"
              title={i.kind}
              tone="neutral"
            />
            <BoardLine gap="6">
              {i.from ? (
                <BoardText data-testid={MentionsWidgetTestId.Author} kind="id">
                  {i.from}
                </BoardText>
              ) : null}
              <BoardText data-testid={MentionsWidgetTestId.Snippet} kind="body">
                {i.text}
              </BoardText>
            </BoardLine>
            <BoardText data-testid={MentionsWidgetTestId.Age} kind="meta" tone="ink3">
              {compactAgo(i.receivedAt, now)}
            </BoardText>
          </BoardGrid>
        </BoardRow>
      ))}
    </>
  );
}
