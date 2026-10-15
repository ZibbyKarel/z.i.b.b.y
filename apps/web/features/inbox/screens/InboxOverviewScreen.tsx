"use client";

import { Grid, Row, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { InboxPage } from "../components/InboxPage";
import { OverviewPanel, OverviewRow } from "../components/OverviewPanel";
import { PR_BLOCKER_TONE, ZIBBY_STATUS_TONE } from "../components/zibbyStatus";
import {
  compareItems,
  comparePrs,
  isActionable,
  isMineBlocked,
  itemKey,
  itemScope,
  pad2,
  passesFilters,
  prListHref,
  splitPrs,
  zibbyStatus,
} from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";
import { issueHref } from "../components/IssueRow";

export enum InboxOverviewScreenTestId {
  Issues = "inbox-overview-issues",
  Prs = "inbox-overview-prs",
}

const TOP_ROWS = 3;

/**
 * `/inbox/overview` — two cards (spec decision 14): the issues that need you and
 * the pull requests to review / blocked of mine, each with its top rows and a link
 * to the sub-page. Both use the shared filters; the sub-nav counters do not.
 */
export function InboxOverviewScreen() {
  const t = useTranslations("inboxPage");
  const { filters } = useInboxFilters();
  const itemsQuery = useInboxItemsQuery();
  const prsQuery = useInboxPrsQuery();

  const actionable = useMemo(
    () =>
      (itemsQuery.data?.items ?? [])
        .filter((item) => isActionable(item) && passesFilters(filters, itemScope(item)))
        .sort(compareItems),
    [itemsQuery.data, filters],
  );
  const { toReview, mine } = useMemo(
    () => splitPrs(prsQuery.data?.prs ?? [], filters),
    [prsQuery.data, filters],
  );
  const mineBlocked = mine.filter(isMineBlocked);
  const topPrs = [...toReview, ...mineBlocked].sort(comparePrs).slice(0, TOP_ROWS);
  const count = (status: "new" | "waiting") =>
    actionable.filter((i) => zibbyStatus(i) === status).length;

  return (
    <InboxPage
      errors={[...(itemsQuery.data?.errors ?? []), ...(prsQuery.data?.errors ?? [])]}
      items={itemsQuery.data}
      status={itemsQuery}
      view="overview"
    >
      <Grid align="stretch" cols={1} gap="150" lg={2}>
        <OverviewPanel
          buckets={(["new", "waiting"] as const).map((status) => ({
            id: status,
            tone: ZIBBY_STATUS_TONE[status],
            label: t(`status.${status}`),
            n: pad2(count(status)),
          }))}
          emptyText={t("overview.noIssues")}
          header={t("overview.issuesHeader")}
          headerEnd={t("overview.issuesSources")}
          headline={t("overview.needYou", { n: pad2(actionable.length) })}
          openHref="/inbox/issues"
          openLabel={t("overview.openIssues")}
          rows={actionable.slice(0, TOP_ROWS).map((item) => (
            <OverviewRow
              href={issueHref(item)}
              key={item.id}
              lead={itemKey(item)}
              testId={`${InboxOverviewScreenTestId.Issues}-${item.id}`}
              title={item.name}
              trailing={
                <Row gap="75">
                  <StatusDot tone={ZIBBY_STATUS_TONE[zibbyStatus(item)]} />
                  <Typography type="label" variant="primary">
                    {t(`status.${zibbyStatus(item)}`)}
                  </Typography>
                </Row>
              }
            />
          ))}
          testId={InboxOverviewScreenTestId.Issues}
        />

        {prsQuery.isPending ? (
          <QueryLoading />
        ) : prsQuery.isError ? (
          <QueryError onRetry={() => void prsQuery.refetch()} />
        ) : (
          <OverviewPanel
            buckets={[
              {
                id: "to-review",
                tone: "idle",
                label: t("overview.toReviewBucket"),
                n: pad2(toReview.length),
              },
              {
                id: "mine-blocked",
                tone: "error",
                label: t("overview.mineBlockedBucket"),
                n: pad2(mineBlocked.length),
              },
            ]}
            emptyText={t("overview.noPrs")}
            header={t("overview.prsHeader")}
            headerEnd={t("overview.prsSources")}
            headline={t("overview.prSummary", {
              toReview: pad2(toReview.length),
              blocked: pad2(mineBlocked.length),
            })}
            openHref="/inbox/pull-requests"
            openLabel={t("overview.openPrs")}
            rows={topPrs.map((pr) => (
              <OverviewRow
                href={prListHref(pr.url)}
                key={pr.number}
                lead={`#${pr.number}`}
                sub={[
                  pr.repo,
                  pr.bucket === "mine"
                    ? t("prs.mine")
                    : pr.reviewReason === "team"
                      ? t("prs.reason.team", { team: pr.reviewTeam ?? "" })
                      : t("prs.reason.direct"),
                ].join(" · ")}
                testId={`${InboxOverviewScreenTestId.Prs}-${pr.number}`}
                title={pr.title}
                trailing={
                  <Row gap="75">
                    <StatusDot tone={PR_BLOCKER_TONE[pr.blocker]} />
                    <Typography type="label" variant="primary">
                      {t(`blocker.${pr.blocker}`)}
                    </Typography>
                  </Row>
                }
              />
            ))}
            testId={InboxOverviewScreenTestId.Prs}
          />
        )}
      </Grid>
    </InboxPage>
  );
}
