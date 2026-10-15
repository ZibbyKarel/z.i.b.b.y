"use client";

import type { InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import {
  Button,
  Card,
  CardContent,
  Container,
  MenuButton,
  type MenuButtonEntry,
  Row,
  Stack,
  StatusDot,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import {
  differsFromSource,
  itemKey,
  latestTaskId,
  linkedPrOf,
  prListHref,
  zibbyStatus,
} from "../inbox";
import { useElapsedLabel } from "../useElapsedLabel";
import { ExternalAnchor, NavLink } from "./links";
import { PR_BLOCKER_TONE, ZibbyStatusLabel } from "./zibbyStatus";

export enum IssueRowTestId {
  Root = "inbox-issue-row",
  Title = "inbox-issue-title",
  Process = "inbox-issue-process",
  Respond = "inbox-issue-respond",
  ViewRun = "inbox-issue-view-run",
  Menu = "inbox-issue-menu",
  Differs = "inbox-issue-differs",
  Hidden = "inbox-issue-hidden",
  PrBadge = "inbox-issue-pr-badge",
  PrList = "inbox-issue-pr-list",
}

const CI_SYMBOL = { passing: "✓", failing: "✗", pending: "…", unknown: "?" } as const;

/** Where an item's detail page lives. */
export function issueHref(item: Pick<InboxRoadmapItem, "id" | "project">): string {
  return `/inbox/issues/${item.project.id}/${item.id}`;
}

export interface IssueRowProps {
  item: InboxRoadmapItem;
  now: number;
  /** Resolved team name (the item only carries `teamId`). */
  teamName?: string | undefined;
  /** The inbox PR this item's linked PR resolves to, for ci / blocker. */
  pr?: InboxPr | undefined;
  /** Indented under an epic accordion. */
  nested?: boolean;
  processing: boolean;
  onProcess: () => void;
  onToggleHidden: () => void;
}

/**
 * One Issues row (spec "Flat list row"): key + title, the primary action, a `⋯`
 * menu (open in source / hide), status tags, the linked-PR badge. The row click
 * and the title link both open the detail page; nested controls never trigger it.
 */
export function IssueRow({
  item,
  now,
  teamName,
  pr,
  nested,
  processing,
  onProcess,
  onToggleHidden,
}: IssueRowProps) {
  const t = useTranslations("inboxPage");
  const router = useRouter();
  const elapsedLabel = useElapsedLabel();
  const status = zibbyStatus(item);
  const href = issueHref(item);
  const taskId = latestTaskId(item);
  const prRef = linkedPrOf(item);
  const sourceName = t(`source.${item.source.kind}`);
  const canHide = !!item.source.integrationId && !!item.source.externalId;

  const open = (e: MouseEvent<HTMLElement>) => {
    const target = e.target;
    // Ignore clicks on nested controls, and events bubbling out of portalled menus.
    if (!(target instanceof Element) || !e.currentTarget.contains(target)) return;
    if (target.closest("a, button, [role='menu'], [role='menuitem']")) return;
    router.push(href as Route);
  };

  const menu: MenuButtonEntry[] = [
    ...(item.source.url
      ? [
          {
            id: "open",
            label: t("row.openIn", { source: sourceName }),
            href: item.source.url,
            trailing: "↗",
          },
        ]
      : []),
    ...(item.source.url && canHide ? [{ id: "divider", divider: true as const }] : []),
    ...(canHide
      ? [
          {
            id: "hide",
            label: item.hidden ? t("row.unhide") : t("row.hide"),
            ...(item.hidden ? {} : { trailing: t("row.permanent") }),
            onSelect: onToggleHidden,
          },
        ]
      : []),
  ];

  return (
    <Container padding={nested ? ["0", "0", "0", "300"] : undefined}>
      <Card
        interactive
        data-testid={`${IssueRowTestId.Root}-${item.id}`}
        onClick={open}
        radius="none"
      >
        <CardContent padding={["150", "200"]}>
          <Stack gap="100">
            <Row gap="150">
              <Container shrink={false} width="5.5rem">
                <Typography mono size="xs" type="note" variant="secondary">
                  {itemKey(item)}
                </Typography>
              </Container>
              <Container grow minW0>
                <TextLink
                  truncate
                  data-testid={IssueRowTestId.Title}
                  href={href}
                  linkComponent={NavLink}
                >
                  <Typography truncate type="body" weight="medium">
                    {item.name}
                  </Typography>
                </TextLink>
              </Container>
              <Row gap="75">
                {status === "new" && (
                  <Button
                    data-testid={IssueRowTestId.Process}
                    intent="primary"
                    loading={processing}
                    onClick={onProcess}
                    size="sm"
                  >
                    {t("row.process")}
                  </Button>
                )}
                {status === "waiting" && (
                  <Button
                    data-testid={IssueRowTestId.Respond}
                    intent="secondary"
                    onClick={() => router.push(href as Route)}
                    size="sm"
                  >
                    {t("row.respond")}
                  </Button>
                )}
                {status === "running" && taskId && (
                  <Button
                    data-testid={IssueRowTestId.ViewRun}
                    intent="secondary"
                    onClick={() => router.push(`/work/tasks/${taskId}` as Route)}
                    size="sm"
                  >
                    {t("row.viewRun")}
                  </Button>
                )}
                {menu.length > 0 && (
                  <Container data-testid={IssueRowTestId.Menu}>
                    <MenuButton
                      ariaLabel={t("row.more")}
                      intent="secondary"
                      items={menu}
                      linkComponent={ExternalAnchor}
                      size="sm"
                    />
                  </Container>
                )}
              </Row>
            </Row>

            <Row wrap gap="100">
              <Tag uppercase tone="neutral">
                {sourceName}
              </Tag>
              {item.sourceStatus && (
                <Row gap="50">
                  <Typography type="label">{t("row.source")}</Typography>
                  <Typography
                    mono
                    uppercase
                    size="2xs"
                    tracking="wider"
                    type="note"
                    variant="secondary"
                  >
                    {item.sourceStatus.name}
                  </Typography>
                </Row>
              )}
              <Row gap="50">
                <Typography type="label">{t("row.zibby")}</Typography>
                <ZibbyStatusLabel status={status} />
              </Row>
              {differsFromSource(item) && (
                <Tag
                  uppercase
                  data-testid={IssueRowTestId.Differs}
                  title={t("row.differsHint")}
                  tone="blocked"
                >
                  {t("row.differs")}
                </Tag>
              )}
              <Tag uppercase tone="neutral">
                {item.project.name}
              </Tag>
              {teamName && (
                <Tag uppercase tone="neutral">
                  {teamName}
                </Tag>
              )}
              {item.hidden && (
                <Tag uppercase data-testid={IssueRowTestId.Hidden} tone="neutral">
                  {t("row.hidden")}
                </Tag>
              )}
              <Container grow textAlign="right">
                <Typography type="label">
                  {t("row.updated", { when: elapsedLabel(item.updatedAt, now) })}
                </Typography>
              </Container>
            </Row>

            {prRef && (
              <Row wrap gap="150">
                <TextLink
                  data-testid={IssueRowTestId.PrBadge}
                  href={prRef.url}
                  linkComponent={ExternalAnchor}
                >
                  <Tag uppercase tone={pr ? PR_BLOCKER_TONE[pr.blocker] : "neutral"}>
                    {pr && <StatusDot tone={PR_BLOCKER_TONE[pr.blocker]} />}
                    {[
                      `#${prRef.number}`,
                      ...(pr ? [`CI ${CI_SYMBOL[pr.ci]}`, t(`blocker.${pr.blocker}`)] : []),
                    ].join(" · ")}{" "}
                    ↗
                  </Tag>
                </TextLink>
                {pr && (
                  <TextLink
                    data-testid={IssueRowTestId.PrList}
                    href={prListHref(prRef.url)}
                    linkComponent={NavLink}
                  >
                    <Typography type="label">{t("row.inPrs")}</Typography>
                  </TextLink>
                )}
              </Row>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
