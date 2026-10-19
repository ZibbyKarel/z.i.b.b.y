"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  Card,
  CardContent,
  Container,
  Pressable,
  Row,
  Stack,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { useElapsedLabel } from "../useElapsedLabel";
import { ExternalAnchor, NavLink } from "./links";

export enum PrRowTestId {
  Root = "inbox-pr-row",
  Title = "inbox-pr-title",
  Review = "inbox-pr-review-badge",
  Ci = "inbox-pr-ci",
  Conflict = "inbox-pr-conflict",
  Draft = "inbox-pr-draft",
  Meta = "inbox-pr-meta",
  Actions = "inbox-pr-actions",
  Item = "inbox-pr-item",
}

const CI_SYMBOL = { passing: "✓", failing: "✗", pending: "…", unknown: "?" } as const;
const CI_TONE = {
  passing: "done",
  failing: "error",
  pending: "working",
  unknown: "neutral",
} as const;

export interface PrRowProps {
  pr: InboxPr;
  now: number;
  /** Project name for the meta line; falls back to the repo. */
  projectName?: string | undefined;
  /** The focused PR (`?pr=`) gets an accent border. */
  focused?: boolean;
  /** The inbox item whose linked PR this is — "ITEM KEY →". */
  item?: { key: string; href: string } | undefined;
  /** Phase 129 — the row's action strip (review / squash-and-merge), when any. */
  actions?: ReactNode;
  /**
   * Master–detail mode: a card click selects the PR (instead of opening GitHub) and the title
   * is plain text — GitHub is opened from the detail header.
   */
  onSelect?: (pr: InboxPr) => void;
}

/**
 * One pull-request card, three lines: `#n` title + review / CI badges; project · author ·
 * age; the actions strip (see `PrActions`) + linked item. Without `onSelect` the whole card
 * opens the PR on GitHub — the title is the real (keyboard-reachable) link, a click anywhere
 * else on the card follows it; with `onSelect` a click selects the PR instead. Clicks inside
 * the actions line never do either.
 */
export function PrRow({ pr, now, projectName, focused, item, actions, onSelect }: PrRowProps) {
  const t = useTranslations("inboxPage");
  const elapsedLabel = useElapsedLabel();
  const openPr = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) return;
    if (onSelect) return onSelect(pr);
    window.open(pr.url, "_blank", "noopener,noreferrer");
  };
  return (
    <Card
      interactive
      data-testid={`${PrRowTestId.Root}-${pr.number}`}
      onClick={openPr}
      radius="none"
      selected={focused === true}
    >
      <CardContent padding={["150", "200"]}>
        <Container cursor="pointer">
          <Stack gap="100">
            <Row gap="150">
              <Typography mono nowrap size="xs" type="note" variant="secondary">
                #{pr.number}
              </Typography>
              <Container grow minW0>
                {onSelect ? (
                  <Pressable
                    aria-pressed={focused === true}
                    data-testid={PrRowTestId.Title}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(pr);
                    }}
                  >
                    <Typography truncate type="body" weight="medium">
                      {pr.title}
                    </Typography>
                  </Pressable>
                ) : (
                  <TextLink
                    data-testid={PrRowTestId.Title}
                    href={pr.url}
                    linkComponent={ExternalAnchor}
                  >
                    <Typography truncate type="body" weight="medium">
                      {pr.title}
                    </Typography>
                  </TextLink>
                )}
              </Container>
              {pr.draft && (
                <Tag uppercase data-testid={PrRowTestId.Draft} tone="neutral">
                  {t("prs.draft")}
                </Tag>
              )}
              {pr.blocker === "merge-conflict" && (
                <Tag uppercase data-testid={PrRowTestId.Conflict} tone="error">
                  {t("blocker.merge-conflict")}
                </Tag>
              )}
              {pr.review !== "none" && (
                <Tag
                  uppercase
                  data-testid={PrRowTestId.Review}
                  tone={pr.review === "approved" ? "done" : "error"}
                >
                  {t(`review.${pr.review}`)}
                </Tag>
              )}
              <Tag uppercase data-testid={PrRowTestId.Ci} tone={CI_TONE[pr.ci]}>
                {t("prs.ci", { symbol: CI_SYMBOL[pr.ci], state: t(`ci.${pr.ci}`) })}
              </Tag>
            </Row>

            <Typography data-testid={PrRowTestId.Meta} type="label" variant="secondary">
              {[projectName ?? pr.repo, pr.author, elapsedLabel(pr.createdAt, now)].join(" · ")}
            </Typography>

            {(actions || item) && (
              // The actions line is its own click zone — a button / menu / checkbox click
              // (portalled menus included, React events bubble through portals) never opens GitHub.
              <Container cursor="auto" onClick={(e) => e.stopPropagation()}>
                <Row wrap data-testid={PrRowTestId.Actions} gap="150">
                  {actions}
                  {item && (
                    <Container grow textAlign="right">
                      <TextLink
                        data-testid={PrRowTestId.Item}
                        href={item.href}
                        linkComponent={NavLink}
                      >
                        <Typography type="label">{t("prs.item", { key: item.key })}</Typography>
                      </TextLink>
                    </Container>
                  )}
                </Row>
              </Container>
            )}
          </Stack>
        </Container>
      </CardContent>
    </Card>
  );
}
