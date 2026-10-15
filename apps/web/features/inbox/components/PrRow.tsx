"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  Card,
  CardContent,
  Container,
  Row,
  Stack,
  StatusDot,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useElapsedLabel } from "../useElapsedLabel";
import { ExternalAnchor, NavLink } from "./links";
import { PR_BLOCKER_TONE } from "./zibbyStatus";

export enum PrRowTestId {
  Root = "inbox-pr-row",
  Open = "inbox-pr-open",
  Blocker = "inbox-pr-blocker",
  Draft = "inbox-pr-draft",
  Reason = "inbox-pr-reason",
  Item = "inbox-pr-item",
}

const CI_SYMBOL = { passing: "✓", failing: "✗", pending: "…", unknown: "?" } as const;

export interface PrRowProps {
  pr: InboxPr;
  now: number;
  /** The focused PR (`?pr=`) gets an accent border. */
  focused?: boolean;
  /** The inbox item whose linked PR this is — "ITEM KEY →". */
  item?: { key: string; href: string } | undefined;
}

/**
 * One pull-request row (spec "Pull requests"): `#n`, title, repo · author · age,
 * "Open on GitHub", ONE prominent blocker tag plus the quieter CI / review /
 * draft / reason details. Read-only — merging stays in the merge queue.
 */
export function PrRow({ pr, now, focused, item }: PrRowProps) {
  const t = useTranslations("inboxPage");
  const elapsedLabel = useElapsedLabel();
  return (
    <Card
      data-testid={`${PrRowTestId.Root}-${pr.number}`}
      radius="none"
      selected={focused === true}
    >
      <CardContent padding={["150", "200"]}>
        <Stack gap="100">
          <Row gap="150">
            <Container shrink={false} width="4rem">
              <Typography mono size="xs" type="note" variant="secondary">
                #{pr.number}
              </Typography>
            </Container>
            <Container grow minW0>
              <Typography truncate type="body" weight="medium">
                {pr.title}
              </Typography>
            </Container>
            <Typography nowrap type="label">
              {[pr.repo, pr.author, elapsedLabel(pr.createdAt, now)].join(" · ")}
            </Typography>
            <TextLink data-testid={PrRowTestId.Open} href={pr.url} linkComponent={ExternalAnchor}>
              <Tag uppercase tone="neutral">
                {t("prs.openGithub")} ↗
              </Tag>
            </TextLink>
          </Row>

          <Row wrap gap="100">
            <Tag uppercase data-testid={PrRowTestId.Blocker} tone={PR_BLOCKER_TONE[pr.blocker]}>
              <StatusDot tone={PR_BLOCKER_TONE[pr.blocker]} />
              {t(`blocker.${pr.blocker}`)}
            </Tag>
            <Typography mono uppercase size="2xs" tracking="wider" type="note" variant="secondary">
              {t("prs.ci", { symbol: CI_SYMBOL[pr.ci], state: t(`ci.${pr.ci}`) })}
            </Typography>
            <Typography mono uppercase size="2xs" tracking="wider" type="note" variant="secondary">
              {t("prs.review", { state: t(`review.${pr.review}`) })}
            </Typography>
            {pr.draft && (
              <Tag uppercase data-testid={PrRowTestId.Draft} tone="neutral">
                {t("prs.draft")}
              </Tag>
            )}
            {pr.bucket === "to-review" && pr.reviewReason && (
              <Tag uppercase data-testid={PrRowTestId.Reason} tone="neutral">
                {pr.reviewReason === "team"
                  ? t("prs.reason.team", { team: pr.reviewTeam ?? "" })
                  : t("prs.reason.direct")}
              </Tag>
            )}
            {item && (
              <Container grow textAlign="right">
                <TextLink data-testid={PrRowTestId.Item} href={item.href} linkComponent={NavLink}>
                  <Typography type="label">{t("prs.item", { key: item.key })}</Typography>
                </TextLink>
              </Container>
            )}
          </Row>
        </Stack>
      </CardContent>
    </Card>
  );
}
