"use client";

import {
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Icon,
  Row,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { pad2, prListHref } from "../../inbox/inbox";
import { useInboxPrsQuery } from "../../inbox/queries";
import { type PrNodeVm, type PrRowVm, prTree } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import { CI_ICON, REVIEW_ICON } from "../widgets/PrFilterControls";

export enum PrsTableScreenTestId {
  Count = "prs-table-screen-count",
}

interface FlatPr {
  row: PrRowVm;
  depth: number;
}

/** The PR tree as table rows, each stacked PR right under its base one level deeper. */
function flatten(nodes: readonly PrNodeVm[], depth = 0): FlatPr[] {
  return nodes.flatMap((n) => [{ row: n.row, depth }, ...flatten(n.kids, depth + 1)]);
}

/**
 * `/activity/pull-requests` (todo-18) — the Overview's OPEN PRS number as a table: the same
 * set (the stored inbox filters, `prTree` with no pick) and order as the PR widget, stacked
 * PRs as nested rows under their base. Row click opens the PR in the inbox detail.
 */
export function PrsTableScreen() {
  const t = useTranslations("prsPage");
  const tPrs = useTranslations("bridge.widgets.prs");
  const router = useRouter();
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const prsQuery = useInboxPrsQuery();

  const { rows, total } = useMemo(() => {
    const tree = prTree("prs-page", prsQuery.data?.prs ?? [], filters, {}, (iso) =>
      compactAgo(iso, now),
    );
    return { rows: flatten(tree.nodes), total: tree.total };
  }, [prsQuery.data, filters, now]);

  const columns: DataTableColumn<FlatPr>[] = [
    {
      key: "pr",
      label: t("column.pr"),
      width: "flex",
      render: ({ row }) => (
        <Stack gap="25">
          <Typography truncate type="note" variant={row.muted ? "tertiary" : undefined}>
            {`${row.number} ${row.title}`}
          </Typography>
          <Typography mono truncate size="2xs" type="note" variant="tertiary">
            {row.project}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "author",
      label: t("column.author"),
      width: "lg",
      render: ({ row }) => (
        <Typography truncate type="note">
          {row.author}
        </Typography>
      ),
    },
    {
      key: "ci",
      label: t("column.ci"),
      width: "lg",
      render: ({ row }) => (
        <Row gap="50">
          <Icon name={CI_ICON[row.ci].name} size="sm" tone={CI_ICON[row.ci].tone} />
          <Typography truncate size="2xs" type="note" variant="secondary">
            {tPrs(`ci.${row.ci}`)}
          </Typography>
        </Row>
      ),
    },
    {
      key: "review",
      label: t("column.review"),
      width: "xl",
      render: ({ row }) => (
        <Row gap="50">
          <Icon name={REVIEW_ICON[row.review].name} size="sm" tone={REVIEW_ICON[row.review].tone} />
          <Typography truncate size="2xs" type="note" variant="secondary">
            {tPrs(`reviewHint.${row.reviewHint}`)}
          </Typography>
        </Row>
      ),
    },
    {
      key: "conversations",
      label: t("column.conversations"),
      width: "sm",
      align: "right",
      render: ({ row }) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {row.conversations > 0 ? row.conversations : ""}
        </Typography>
      ),
    },
    {
      key: "updated",
      label: t("column.updated"),
      width: "sm",
      align: "right",
      render: ({ row }) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {row.age}
        </Typography>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Row justify="between">
          <Typography type="h1">{t("title")}</Typography>
          <Typography data-testid={PrsTableScreenTestId.Count} type="label">
            {pad2(total)}
          </Typography>
        </Row>
        {prsQuery.isPending ? (
          <QueryLoading />
        ) : prsQuery.isError ? (
          <QueryError onRetry={() => void prsQuery.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            empty={<EmptyState body={t("emptyBody")} title={t("emptyTitle")} />}
            getRowDepth={(r) => r.depth}
            getRowKey={(r) => r.row.id}
            onRowClick={(r) => router.push(prListHref(r.row.id) as Route)}
            rows={rows}
          />
        )}
      </Stack>
    </Container>
  );
}
