"use client";

import type { InboxRoadmapItem } from "@zibby/contracts";
import {
  Alert,
  Button,
  Container,
  EmptyState,
  Grid,
  Markdown,
  Panel,
  Row,
  Stack,
  StatusDot,
  type SubNavLinkComponent,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageBreadcrumb } from "../../../components/layout/PageBreadcrumb";
import { useNow } from "../../../hooks/useNow";
import { useCompaniesQuery } from "../../companies";
import { useTeamsQuery } from "../../teams";
import { ExternalAnchor, NavLink } from "../components/links";
import { PR_BLOCKER_TONE, ZibbyStatusLabel } from "../components/zibbyStatus";
import {
  differsFromSource,
  findPr,
  itemKey,
  latestTaskId,
  linkedPrOf,
  prListHref,
  zibbyStatus,
} from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useElapsedLabel } from "../useElapsedLabel";
import { useInboxItemActions } from "../useInboxItemActions";

export enum InboxItemScreenTestId {
  Root = "inbox-item-root",
  Title = "inbox-item-title",
  Back = "inbox-item-back",
  OpenSource = "inbox-item-open-source",
  Hide = "inbox-item-hide",
  Process = "inbox-item-process",
  ViewRun = "inbox-item-view-run",
  Status = "inbox-item-status",
  Drift = "inbox-item-drift",
  Waiting = "inbox-item-waiting",
  Description = "inbox-item-description",
  Log = "inbox-item-log",
  LinkedPr = "inbox-item-linked-pr",
  Meta = "inbox-item-meta",
  MetaProject = "inbox-item-meta-project",
  MetaCompany = "inbox-item-meta-company",
  MetaTeam = "inbox-item-meta-team",
  Scope = "inbox-item-scope",
  NotFound = "inbox-item-not-found",
}

export interface InboxItemScreenProps {
  projectId: string;
  itemId: string;
}

interface LogEntry {
  at: string;
  text: string;
}

function MetaRow({
  label,
  value,
  href,
  testId,
}: {
  label: string;
  value: string;
  href?: string;
  testId?: string;
}) {
  const text = <Typography type="bodySm">{value}</Typography>;
  return (
    <Row gap="150">
      <Container shrink={false} width="6rem">
        <Typography type="label">{label}</Typography>
      </Container>
      <Container grow minW0>
        {href ? (
          <TextLink data-testid={testId} href={href} linkComponent={NavLink}>
            {text}
          </TextLink>
        ) : (
          text
        )}
      </Container>
    </Row>
  );
}

/**
 * `/dashboard/inbox/issues/[projectId]/[itemId]` — read-only item detail (a page, not a
 * dialog): the source's task (title, description) next to ZIBBY's execution
 * (status, log, linked PR). It never edits the task; "waiting for you" only
 * shows when the lifecycle says so — a failed run's reason or a PR awaiting merge.
 */
export function InboxItemScreen({ projectId, itemId }: InboxItemScreenProps) {
  const t = useTranslations("inboxPage");
  const router = useRouter();
  const itemsQuery = useInboxItemsQuery();
  const item = itemsQuery.data?.items.find((i) => i.id === itemId && i.projectId === projectId);

  if (itemsQuery.isPending) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
      </Container>
    );
  }
  if (itemsQuery.isError) {
    return (
      <Container padding={["300", "350"]}>
        <QueryError onRetry={() => void itemsQuery.refetch()} />
      </Container>
    );
  }
  if (!item) {
    return (
      <Container padding={["300", "350"]}>
        <Stack gap="250">
          <PageBreadcrumb
            items={[
              { label: t("title.issues"), href: "/dashboard/inbox/issues" },
              { label: t("detail.crumb", { key: itemId }) },
            ]}
            linkComponent={NavLink as SubNavLinkComponent}
          />
          <EmptyState
            action={
              <Button
                intent="secondary"
                onClick={() => router.push("/dashboard/inbox/issues" as Route)}
                size="sm"
              >
                {t("detail.back")}
              </Button>
            }
            body={t("detail.notFoundBody")}
            data-testid={InboxItemScreenTestId.NotFound}
            title={t("detail.notFoundTitle")}
          />
        </Stack>
      </Container>
    );
  }
  return <InboxItemView item={item} />;
}

function InboxItemView({ item: it }: { item: InboxRoadmapItem }) {
  const t = useTranslations("inboxPage");
  const router = useRouter();
  const now = useNow(60_000);
  const elapsedLabel = useElapsedLabel();
  const prsQuery = useInboxPrsQuery();
  const { data: companies } = useCompaniesQuery();
  const { data: teams } = useTeamsQuery();
  const actions = useInboxItemActions();

  const prRef = linkedPrOf(it);
  const pr = findPr(prsQuery.data?.prs ?? [], prRef);

  const log = useMemo<LogEntry[]>(() => {
    const source = t(`source.${it.source.kind}`);
    const entries: LogEntry[] = [];
    for (const run of it.runs) {
      entries.push({ at: run.startedAt, text: t("detail.log.started", { task: run.taskId }) });
      if (run.prNumber !== undefined) {
        entries.push({
          at: run.finishedAt ?? run.startedAt,
          text: t("detail.log.prOpened", { n: run.prNumber }),
        });
      }
      if (run.finishedAt) {
        entries.push({
          at: run.finishedAt,
          text: t("detail.log.finished", {
            task: run.taskId,
            outcome: t(`detail.log.outcome.${run.outcome}`),
          }),
        });
      }
    }
    if (it.lifecycle === "failed" && it.lastFailureReason) {
      entries.push({
        at: it.updatedAt,
        text: t("detail.log.failure", { reason: it.lastFailureReason }),
      });
    }
    entries.push({
      at: it.syncedAt ?? it.updatedAt,
      text: t("detail.log.synced", {
        source,
        scope: (it.scopeReasons ?? []).map((r) => t(`scope.${r}`)).join(", ") || "—",
      }),
    });
    return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [it, t]);

  const status = zibbyStatus(it);
  const key = itemKey(it);
  const sourceName = t(`source.${it.source.kind}`);
  const taskId = latestTaskId(it);
  const canHide = !!it.source.integrationId && !!it.source.externalId;
  const company = it.companyId ? companies?.find((c) => c.id === it.companyId) : undefined;
  const team = it.teamId ? teams?.find((x) => x.id === it.teamId) : undefined;
  const waitingFailed = it.lifecycle === "failed";
  const waitingMerge = it.lifecycle === "awaiting-merge";
  const viewRun = () => router.push(`/work/tasks/${taskId}` as Route);

  return (
    <Container data-testid={InboxItemScreenTestId.Root} padding={["300", "350"]}>
      <Stack gap="250">
        <PageBreadcrumb
          items={[
            { label: t("title.issues"), href: "/dashboard/inbox/issues" },
            { label: t("detail.crumb", { key }) },
          ]}
          linkComponent={NavLink as SubNavLinkComponent}
        />

        <Row wrap align="end" gap="200" justify="between">
          <Stack gap="100">
            <TextLink
              data-testid={InboxItemScreenTestId.Back}
              href="/dashboard/inbox/issues"
              linkComponent={NavLink}
            >
              <Typography type="label">{t("detail.back")}</Typography>
            </TextLink>
            <Typography type="label">{[key, sourceName, it.project.name].join(" · ")}</Typography>
            <Typography data-testid={InboxItemScreenTestId.Title} type="h1">
              {it.name}
            </Typography>
          </Stack>
          <Row wrap gap="100">
            {it.source.url && (
              <TextLink
                data-testid={InboxItemScreenTestId.OpenSource}
                href={it.source.url}
                linkComponent={ExternalAnchor}
              >
                <Tag uppercase size="md" tone="neutral">
                  {t("detail.openIn", { source: sourceName })}
                </Tag>
              </TextLink>
            )}
            {canHide && (
              <Button
                data-testid={InboxItemScreenTestId.Hide}
                intent="secondary"
                onClick={() => actions.toggleHidden(it)}
                size="sm"
              >
                {it.hidden ? t("row.unhide") : t("row.hide")}
              </Button>
            )}
            {status === "new" && (
              <Button
                data-testid={InboxItemScreenTestId.Process}
                loading={actions.isProcessing(it)}
                onClick={() => actions.process(it)}
                size="sm"
              >
                {t("row.process")}
              </Button>
            )}
            {status === "running" && taskId && (
              <Button data-testid={InboxItemScreenTestId.ViewRun} onClick={viewRun} size="sm">
                {t("row.viewRun")}
              </Button>
            )}
          </Row>
        </Row>

        <Panel data-testid={InboxItemScreenTestId.Status} padding={["150", "200"]} radius="none">
          <Grid cols={1} gap="200" sm={3}>
            <Stack gap="75">
              <Typography type="label">
                {t("detail.sourceStatus", { source: sourceName })}
              </Typography>
              <Typography type="h3">{it.sourceStatus?.name ?? "—"}</Typography>
            </Stack>
            <Stack gap="75">
              <Typography type="label">{t("detail.execution")}</Typography>
              <ZibbyStatusLabel status={status} />
            </Stack>
            <Stack gap="75">
              <Typography type="label">{t("detail.lastChange")}</Typography>
              <Typography type="h3">{elapsedLabel(it.updatedAt, now)}</Typography>
            </Stack>
          </Grid>
        </Panel>

        {differsFromSource(it) && (
          <Alert data-testid={InboxItemScreenTestId.Drift} severity="warn" title={t("row.differs")}>
            {t("detail.differsBody", {
              source: sourceName,
              status: it.sourceStatus?.name ?? "",
            })}
          </Alert>
        )}

        <Grid cols={1} gap="200" sidebar="right">
          <Stack gap="200">
            {(waitingFailed || waitingMerge) && (
              <Panel
                data-testid={InboxItemScreenTestId.Waiting}
                header={t("detail.waiting")}
                padding="200"
                radius="none"
                tone="blocked"
              >
                <Stack gap="150">
                  <Typography type="body">
                    {waitingFailed
                      ? (it.lastFailureReason ?? t("detail.waitFailedNoReason"))
                      : prRef
                        ? t("detail.waitMerge", { n: prRef.number })
                        : t("detail.waitMergeNoPr")}
                  </Typography>
                  <Row wrap gap="100">
                    {waitingMerge && prRef && (
                      <Button
                        onClick={() =>
                          router.push(
                            (pr
                              ? prListHref(prRef.url)
                              : "/dashboard/inbox/pull-requests") as Route,
                          )
                        }
                        size="sm"
                      >
                        {t("detail.openPr")}
                      </Button>
                    )}
                    {waitingFailed && taskId && (
                      <Button intent="secondary" onClick={viewRun} size="sm">
                        {t("row.viewRun")}
                      </Button>
                    )}
                  </Row>
                </Stack>
              </Panel>
            )}

            <Panel
              data-testid={InboxItemScreenTestId.Description}
              header={t("detail.description")}
              headerEnd={t("detail.readOnly", { source: sourceName })}
              padding="200"
              radius="none"
            >
              {it.description.trim() ? (
                <Markdown escapeHtml source={it.description} />
              ) : (
                <Typography type="body" variant="secondary">
                  {t("detail.noDescription", { source: sourceName })}
                </Typography>
              )}
            </Panel>

            <Panel
              data-testid={InboxItemScreenTestId.Log}
              header={t("detail.log.title")}
              headerEnd={
                taskId ? (
                  <Button intent="ghost" onClick={viewRun} size="sm">
                    {t("detail.viewRun")}
                  </Button>
                ) : undefined
              }
              padding="150"
              radius="none"
            >
              <Stack gap="75">
                {log.map((entry, i) => (
                  <Row align="baseline" gap="150" key={`${entry.at}-${i}`}>
                    <Container shrink={false} width="7rem">
                      <Typography mono size="xs" type="note" variant="tertiary">
                        {elapsedLabel(entry.at, now)}
                      </Typography>
                    </Container>
                    <Container grow minW0>
                      <Typography
                        mono
                        size="xs"
                        type="note"
                        variant={i === 0 ? "primary" : "secondary"}
                      >
                        {entry.text}
                      </Typography>
                    </Container>
                  </Row>
                ))}
              </Stack>
            </Panel>
          </Stack>

          <Stack gap="150">
            {prRef && (
              <Panel
                data-testid={InboxItemScreenTestId.LinkedPr}
                header={t("detail.linkedPr", { n: prRef.number })}
                headerEnd={pr?.repo}
                padding="150"
                radius="none"
              >
                <Stack gap="100">
                  <Typography type="body" weight="medium">
                    {prRef.title || pr?.title || `#${prRef.number}`}
                  </Typography>
                  {pr && (
                    <Row wrap gap="75">
                      <Tag uppercase tone={PR_BLOCKER_TONE[pr.blocker]}>
                        <StatusDot tone={PR_BLOCKER_TONE[pr.blocker]} />
                        {t(`blocker.${pr.blocker}`)}
                      </Tag>
                      <Tag uppercase tone="neutral">
                        {t("prs.ci", { symbol: "", state: t(`ci.${pr.ci}`) }).trim()} ·{" "}
                        {t(`review.${pr.review}`)}
                      </Tag>
                    </Row>
                  )}
                  <Row wrap gap="75">
                    <TextLink href={prRef.url} linkComponent={ExternalAnchor}>
                      <Tag uppercase tone="neutral">
                        {t("prs.openGithub")} ↗
                      </Tag>
                    </TextLink>
                    {pr && (
                      <TextLink href={prListHref(prRef.url)} linkComponent={NavLink}>
                        <Typography type="label">{t("detail.inList")}</Typography>
                      </TextLink>
                    )}
                  </Row>
                </Stack>
              </Panel>
            )}

            <Panel data-testid={InboxItemScreenTestId.Meta} padding="150" radius="none">
              <Stack gap="100">
                <MetaRow
                  href={`/projects/${it.project.id}`}
                  label={t("detail.meta.project")}
                  testId={InboxItemScreenTestId.MetaProject}
                  value={it.project.name}
                />
                <MetaRow
                  href={company ? `/companies/${company.id}` : undefined}
                  label={t("detail.meta.company")}
                  testId={InboxItemScreenTestId.MetaCompany}
                  value={company?.name ?? t("detail.noCompany")}
                />
                <MetaRow
                  href={team ? `/teams/${team.id}` : undefined}
                  label={t("detail.meta.team")}
                  testId={InboxItemScreenTestId.MetaTeam}
                  value={team?.name ?? t("detail.noTeam")}
                />
                <Stack data-testid={InboxItemScreenTestId.Scope} gap="75">
                  <Typography type="label">{t("detail.why")}</Typography>
                  <Row wrap gap="75">
                    {(it.scopeReasons ?? []).map((reason) => (
                      <Tag uppercase key={reason} tone="neutral">
                        {t(`scope.${reason}`)}
                      </Tag>
                    ))}
                  </Row>
                </Stack>
              </Stack>
            </Panel>
          </Stack>
        </Grid>
      </Stack>
    </Container>
  );
}
